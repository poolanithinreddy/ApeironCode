import {redactProjectBrainText, truncateForPrompt} from './safety.js';
import type {ProjectBrainSummary} from './types.js';

export type BrainContextIntent =
  | 'continue'
  | 'architecture'
  | 'bug-fix'
  | 'app-build'
  | 'frontend'
  | 'backend'
  | 'test'
  | 'review'
  | 'general';

export interface BrainFileSelection {
  relativePath: string;
  reason: string;
  maxChars: number;
  priority: number;
}

export interface BrainContextSelection {
  intent: BrainContextIntent;
  selectedFiles: BrainFileSelection[];
  estimatedTokens: number;
  tokenBudget: number;
  withinBudget: boolean;
  selectionReason: string;
}

export interface PlanBrainContextOptions {
  tokenBudget?: number;
  maxCharsPerFile?: number;
  includeWorkflowMetadata?: boolean;
}

const TOKEN_PER_CHAR = 0.25;
const estimateTokens = (chars: number): number => Math.ceil(chars * TOKEN_PER_CHAR);

const CONTINUE_RE = /\b(continue|keep going|next|resume|carry on|what.s next)\b/iu;
const ARCH_RE = /\b(architect|architecture|design|structure|diagram|adr|decision)\b/iu;
const BUG_RE = /\b(fix|bug|error|crash|fail|broken|debug|exception|traceback)\b/iu;
const APP_BUILD_RE = /\b(build|create|implement|ship|develop)\b.{60,}\b(app|saas|platform|product)\b/isu;
const FRONTEND_RE = /\b(frontend|ui|ux|react|vue|svelte|css|tailwind|component|page|layout)\b/iu;
const BACKEND_RE = /\b(backend|api|server|database|db|postgres|prisma|endpoint|route|auth)\b/iu;
const TEST_RE = /\b(test|spec|failing test|coverage|vitest|jest|playwright|e2e)\b/iu;
const REVIEW_RE = /\b(review|security|audit|lint|refactor|clean)\b/iu;

export const detectBrainContextIntent = (prompt: string): BrainContextIntent => {
  const p = prompt.toLowerCase();
  if (CONTINUE_RE.test(p)) return 'continue';
  if (APP_BUILD_RE.test(p)) return 'app-build';
  if (ARCH_RE.test(p)) return 'architecture';
  if (BUG_RE.test(p) && TEST_RE.test(p)) return 'test';
  if (BUG_RE.test(p)) return 'bug-fix';
  if (FRONTEND_RE.test(p)) return 'frontend';
  if (BACKEND_RE.test(p)) return 'backend';
  if (TEST_RE.test(p)) return 'test';
  if (REVIEW_RE.test(p)) return 'review';
  return 'general';
};

const FILE_CONFIGS: Record<BrainContextIntent, BrainFileSelection[]> = {
  continue: [
    {relativePath: '.apeironcode/PLAN.md', reason: 'current plan', maxChars: 1_200, priority: 1},
    {relativePath: '.apeironcode/TASKS.md', reason: 'task backlog', maxChars: 1_000, priority: 2},
    {relativePath: '.apeironcode/RUNS.md', reason: 'recent runs', maxChars: 800, priority: 3},
    {relativePath: '.apeironcode/VERIFY.md', reason: 'verification state', maxChars: 600, priority: 4},
  ],
  architecture: [
    {relativePath: '.apeironcode/DECISIONS.md', reason: 'architecture decisions', maxChars: 1_500, priority: 1},
    {relativePath: '.apeironcode/PROJECT.md', reason: 'project context', maxChars: 1_000, priority: 2},
    {relativePath: '.apeironcode/REFERENCES.md', reason: 'references', maxChars: 600, priority: 3},
  ],
  'bug-fix': [
    {relativePath: '.apeironcode/VERIFY.md', reason: 'verification state', maxChars: 1_200, priority: 1},
    {relativePath: '.apeironcode/TASKS.md', reason: 'known issues', maxChars: 800, priority: 2},
    {relativePath: '.apeironcode/RUNS.md', reason: 'recent failures', maxChars: 800, priority: 3},
  ],
  'app-build': [
    {relativePath: '.apeironcode/PROJECT.md', reason: 'product context', maxChars: 1_200, priority: 1},
    {relativePath: '.apeironcode/PLAN.md', reason: 'build phases', maxChars: 1_000, priority: 2},
    {relativePath: '.apeironcode/TASKS.md', reason: 'task backlog', maxChars: 800, priority: 3},
  ],
  frontend: [
    {relativePath: '.apeironcode/PROJECT.md', reason: 'product context', maxChars: 800, priority: 1},
    {relativePath: '.apeironcode/DECISIONS.md', reason: 'frontend decisions', maxChars: 600, priority: 2},
    {relativePath: '.apeironcode/TASKS.md', reason: 'frontend tasks', maxChars: 600, priority: 3},
  ],
  backend: [
    {relativePath: '.apeironcode/PROJECT.md', reason: 'project context', maxChars: 800, priority: 1},
    {relativePath: '.apeironcode/DECISIONS.md', reason: 'backend decisions', maxChars: 600, priority: 2},
    {relativePath: '.apeironcode/TASKS.md', reason: 'backend tasks', maxChars: 600, priority: 3},
  ],
  test: [
    {relativePath: '.apeironcode/VERIFY.md', reason: 'verification state', maxChars: 1_200, priority: 1},
    {relativePath: '.apeironcode/RUNS.md', reason: 'recent test runs', maxChars: 800, priority: 2},
    {relativePath: '.apeironcode/TASKS.md', reason: 'failing tasks', maxChars: 600, priority: 3},
  ],
  review: [
    {relativePath: '.apeironcode/DECISIONS.md', reason: 'architecture decisions', maxChars: 1_000, priority: 1},
    {relativePath: '.apeironcode/VERIFY.md', reason: 'verification state', maxChars: 800, priority: 2},
    {relativePath: '.apeironcode/PLAN.md', reason: 'plan context', maxChars: 600, priority: 3},
  ],
  general: [
    {relativePath: '.apeironcode/PROJECT.md', reason: 'project overview', maxChars: 800, priority: 1},
    {relativePath: '.apeironcode/PLAN.md', reason: 'current plan', maxChars: 600, priority: 2},
  ],
};

export const selectBrainFilesForPrompt = (
  prompt: string,
  summary: ProjectBrainSummary,
  options: PlanBrainContextOptions = {},
): BrainContextSelection => {
  const budget = options.tokenBudget ?? 900;
  const intent = detectBrainContextIntent(prompt);
  const candidates = FILE_CONFIGS[intent] ?? FILE_CONFIGS['general'];

  // Filter to files that actually exist
  const existing = candidates.filter((sel) =>
    summary.keyFilesPresent.includes(sel.relativePath),
  );

  // Progressive disclosure: stay within budget
  const selected: BrainFileSelection[] = [];
  let totalTokens = 0;
  for (const sel of existing) {
    const est = estimateTokens(sel.maxChars);
    if (totalTokens + est > budget && selected.length > 0) break;
    selected.push(sel);
    totalTokens += est;
  }

  return {
    intent,
    selectedFiles: selected,
    estimatedTokens: totalTokens,
    tokenBudget: budget,
    withinBudget: totalTokens <= budget,
    selectionReason: `Intent detected: ${intent}. Selected ${selected.length} of ${candidates.length} candidate files.`,
  };
};

export const planProjectBrainContext = (
  prompt: string,
  brainSummary: ProjectBrainSummary,
  options: PlanBrainContextOptions = {},
): BrainContextSelection => selectBrainFilesForPrompt(prompt, brainSummary, options);

export const estimateBrainContextTokens = (selection: BrainContextSelection): number =>
  selection.estimatedTokens;

export const explainBrainContextSelection = (selection: BrainContextSelection): string =>
  redactProjectBrainText([
    `Brain Context Selection`,
    `Intent: ${selection.intent}`,
    `Token budget: ${selection.tokenBudget} (estimated ${selection.estimatedTokens} used)`,
    `Within budget: ${selection.withinBudget ? 'yes' : 'no'}`,
    `Reason: ${selection.selectionReason}`,
    '',
    'Selected files:',
    ...selection.selectedFiles.map((f) => `  ${f.relativePath} — ${f.reason} (up to ${f.maxChars} chars)`),
  ].join('\n'));

export const formatBrainContextForPrompt = async (
  selection: BrainContextSelection,
  cwd: string,
  options: {maxTotal?: number} = {},
): Promise<string> => {
  const {readTextFile} = await import('../utils/fs.js');
  const {fileExists} = await import('../utils/fs.js');
  const path = await import('node:path');
  const maxTotal = options.maxTotal ?? 4_000;

  const parts: string[] = [];
  let totalChars = 0;
  for (const sel of selection.selectedFiles) {
    if (totalChars >= maxTotal) break;
    const absPath = path.join(cwd, sel.relativePath);
    if (!(await fileExists(absPath))) continue;
    const raw = await readTextFile(absPath).catch(() => '');
    const content = truncateForPrompt(raw, Math.min(sel.maxChars, maxTotal - totalChars));
    parts.push(`## ${sel.relativePath}\n${content}`);
    totalChars += content.length;
  }

  return redactProjectBrainText(parts.join('\n\n'));
};
