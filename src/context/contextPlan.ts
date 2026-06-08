import path from 'node:path';
import type {AgentMode} from '../agent/types.js';
import type {FailureSignal} from './failureMapper.js';
import type {AffectedFileResult} from './affectedFiles.js';

export type ContextTaskType =
  | 'explain'
  | 'debug'
  | 'test_fix'
  | 'feature'
  | 'refactor'
  | 'review'
  | 'connector'
  | 'github_automation'
  | 'mcp'
  | 'unknown';

export interface ContextPlan {
  excludedFiles: Array<{path: string; reason: string}>;
  explanation: string;
  fullFiles: string[];
  memoryKindsLikelyNeeded?: string[];
  relatedFiles: string[];
  summaryFiles: string[];
  taskType: ContextTaskType;
  testFiles: string[];
  tokenBudget: number;
  toolsLikelyNeeded: string[];
}

export interface ContextPlanSignals {
  affected?: AffectedFileResult;
  changedFiles?: string[];
  defaultTokenBudget?: number;
  failureSignals?: FailureSignal[];
  knownFiles?: string[];
  symbolFiles?: string[];
  testFiles?: string[];
}

const FILE_PATH_RE = /(?:^|\s)([./]?[\w./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|java|json|md|yaml|yml))(?=$|[\s,.;:])/giu;

const matchesAny = (text: string, words: RegExp[]): boolean => words.some((re) => re.test(text));

export const classifyTaskType = (prompt: string, mode?: AgentMode): ContextTaskType => {
  const lower = prompt.toLowerCase();
  if (mode === 'review' || matchesAny(lower, [/\breview\b/u, /code review/u, /pr review/u])) return 'review';
  if (matchesAny(lower, [/\bgithub\b/u, /pull request/u, /\bissue\b.*\bopen\b/u, /\bautomation\b/u])) return 'github_automation';
  if (matchesAny(lower, [/\bmcp\b/u])) return 'mcp';
  if (matchesAny(lower, [/\bconnector\b/u, /\bprovider\b/u, /\bapi key\b/u])) return 'connector';
  if (mode === 'test-fix' || matchesAny(lower, [/test fix/u, /failing test/u, /\bfix.*test/u, /test.*fail/u])) return 'test_fix';
  if (mode === 'debug' || matchesAny(lower, [/\bdebug\b/u, /\berror\b/u, /\bcrash\b/u, /\bstack trace\b/u])) return 'debug';
  if (mode === 'refactor' || matchesAny(lower, [/\brefactor\b/u, /rename .*to/u, /extract\s+(method|function)/u])) return 'refactor';
  if (mode === 'explain' || matchesAny(lower, [/\bexplain\b/u, /how does/u, /walk me through/u, /summari[sz]e/u])) return 'explain';
  if (matchesAny(lower, [/\badd\b.*\bfeature\b/u, /\bimplement\b/u, /\bbuild\b/u, /\bcreate\b/u])) return 'feature';
  return 'unknown';
};

const extractMentionedFiles = (prompt: string, knownFiles: Set<string>): string[] => {
  const found = new Set<string>();
  for (const m of prompt.matchAll(FILE_PATH_RE)) {
    let candidate = (m[1] ?? '').replace(/^\.\//u, '').replace(/^\//u, '');
    candidate = path.posix.normalize(candidate);
    if (knownFiles.has(candidate)) {
      found.add(candidate);
      continue;
    }
    for (const known of knownFiles) {
      if (known.endsWith(`/${candidate}`) || known === candidate) {
        found.add(known);
        break;
      }
    }
  }
  return [...found];
};

const isTestPath = (file: string): boolean =>
  /\.(?:test|spec)\.[tj]sx?$/u.test(file)
  || /\b__tests__\b/u.test(file)
  || /(?:^|\/)tests?\//u.test(file)
  || /_test\.go$/u.test(file)
  || /Test\.java$/u.test(file);

const baseTokenBudgetFor = (taskType: ContextTaskType): number => {
  switch (taskType) {
    case 'explain':
      return 4_500;
    case 'debug':
      return 6_500;
    case 'test_fix':
      return 6_500;
    case 'refactor':
      return 7_500;
    case 'review':
      return 7_000;
    case 'feature':
      return 6_000;
    case 'connector':
    case 'github_automation':
    case 'mcp':
      return 4_000;
    default:
      return 5_000;
  }
};

const baseToolsFor = (taskType: ContextTaskType): string[] => {
  switch (taskType) {
    case 'debug':
    case 'test_fix':
      return ['read_file', 'grep', 'run_tests', 'git_diff'];
    case 'refactor':
      return ['read_file', 'grep', 'edit_file', 'run_tests'];
    case 'review':
      return ['read_file', 'git_diff', 'project_tree'];
    case 'explain':
      return ['read_file', 'project_tree'];
    case 'feature':
      return ['read_file', 'edit_file', 'grep'];
    default:
      return ['read_file', 'project_tree'];
  }
};

const baseMemoryKinds = (taskType: ContextTaskType): string[] => {
  switch (taskType) {
    case 'review':
    case 'refactor':
      return ['feedback', 'project'];
    case 'debug':
    case 'test_fix':
      return ['feedback', 'project'];
    case 'connector':
    case 'github_automation':
    case 'mcp':
      return ['reference'];
    default:
      return ['user', 'project'];
  }
};

export const buildContextPlan = (
  prompt: string,
  files: string[],
  signals: ContextPlanSignals = {},
  mode?: AgentMode,
): ContextPlan => {
  const knownFiles = new Set(files);
  const taskType = classifyTaskType(prompt, mode);
  const mentioned = extractMentionedFiles(prompt, knownFiles);
  const changed = signals.changedFiles ?? [];
  const failureFiles = (signals.failureSignals ?? [])
    .map((s) => s.file)
    .filter((f): f is string => Boolean(f && knownFiles.has(f)));
  const affected = signals.affected;

  const fullSet = new Set<string>();
  const summarySet = new Set<string>();
  const testSet = new Set<string>();
  const relatedSet = new Set<string>();

  if (taskType !== 'explain') {
    for (const m of mentioned) {
      if (isTestPath(m)) testSet.add(m);
      else fullSet.add(m);
    }
  }

  if (taskType === 'test_fix') {
    for (const f of failureFiles) fullSet.add(f);
    if (affected) {
      for (const t of affected.testFiles) {
        fullSet.add(t);
        testSet.add(t);
      }
      for (const f of affected.directFiles) fullSet.add(f);
    }
  } else if (taskType === 'debug') {
    for (const f of failureFiles) fullSet.add(f);
    for (const f of changed) fullSet.add(f);
  } else if (taskType === 'refactor') {
    for (const f of changed) fullSet.add(f);
    if (affected) {
      for (const f of affected.directFiles) fullSet.add(f);
      for (const f of affected.dependentFiles) summarySet.add(f);
      for (const t of affected.testFiles) {
        testSet.add(t);
        summarySet.add(t);
      }
    }
  } else if (taskType === 'review') {
    for (const f of changed) fullSet.add(f);
    if (affected) for (const f of affected.testFiles) testSet.add(f);
  } else if (taskType === 'explain') {
    for (const m of mentioned) summarySet.add(m);
  } else if (taskType === 'feature') {
    for (const m of mentioned) fullSet.add(m);
    for (const f of changed) summarySet.add(f);
  } else if (taskType === 'connector' || taskType === 'github_automation' || taskType === 'mcp') {
    for (const m of mentioned) fullSet.add(m);
  } else {
    for (const m of mentioned) fullSet.add(m);
  }

  for (const sf of signals.symbolFiles ?? []) {
    if (knownFiles.has(sf) && !fullSet.has(sf)) summarySet.add(sf);
  }
  for (const t of signals.testFiles ?? []) {
    if (knownFiles.has(t) && !fullSet.has(t)) testSet.add(t);
  }

  for (const f of testSet) summarySet.delete(f);
  for (const f of fullSet) summarySet.delete(f);

  const related = Array.from(relatedSet).filter((f) => !fullSet.has(f) && !summarySet.has(f) && !testSet.has(f));

  const excluded: ContextPlan['excludedFiles'] = [];
  if (taskType === 'connector' || taskType === 'github_automation' || taskType === 'mcp') {
    for (const file of files) {
      if (fullSet.has(file) || summarySet.has(file) || testSet.has(file)) continue;
      if (file.startsWith('node_modules/') || /^vendor\//u.test(file)) continue;
      if (isTestPath(file)) excluded.push({path: file, reason: `${taskType} task: tests excluded by default`});
    }
  }

  const tokenBudget = signals.defaultTokenBudget ?? baseTokenBudgetFor(taskType);
  const toolsLikelyNeeded = baseToolsFor(taskType);
  const memoryKindsLikelyNeeded = baseMemoryKinds(taskType);

  const explanation = [
    `Plan: taskType=${taskType}, mode=${mode ?? 'default'}`,
    `Mentioned files: ${mentioned.length} (${mentioned.slice(0, 5).join(', ') || 'none'})`,
    `Full: ${fullSet.size}, Summary: ${summarySet.size}, Tests: ${testSet.size}`,
    `Token budget: ${tokenBudget}`,
    affected ? `Affected confidence: ${affected.confidence.toFixed(2)}` : 'Affected analysis: not available',
  ].join('\n');

  return {
    excludedFiles: excluded.slice(0, 50),
    explanation,
    fullFiles: [...fullSet].sort(),
    memoryKindsLikelyNeeded,
    relatedFiles: related.sort(),
    summaryFiles: [...summarySet].sort(),
    taskType,
    testFiles: [...testSet].sort(),
    tokenBudget,
    toolsLikelyNeeded,
  };
};

export const explainContextPlan = (plan: ContextPlan): string => {
  return [
    plan.explanation,
    plan.fullFiles.length > 0 ? `Full files: ${plan.fullFiles.join(', ')}` : 'Full files: none',
    plan.summaryFiles.length > 0 ? `Summary files: ${plan.summaryFiles.slice(0, 10).join(', ')}` : 'Summary files: none',
    plan.testFiles.length > 0 ? `Test files: ${plan.testFiles.slice(0, 10).join(', ')}` : 'Test files: none',
    plan.excludedFiles.length > 0 ? `Excluded: ${plan.excludedFiles.slice(0, 5).map((e) => e.path).join(', ')} (+${Math.max(0, plan.excludedFiles.length - 5)} more)` : 'Excluded: none',
    `Likely tools: ${plan.toolsLikelyNeeded.join(', ')}`,
  ].join('\n');
};
