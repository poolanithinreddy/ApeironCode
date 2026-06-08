import {redactProjectBrainText, truncateForPrompt} from './safety.js';

export interface RunExtractorInput {
  prompt?: string;
  agentResult?: Record<string, unknown>;
  taskOutput?: string;
  toolBatchSummary?: string;
  completionGateResult?: Record<string, unknown>;
  changedFiles?: string[];
  commandsRun?: string[];
  testsRun?: string[];
  failures?: string[];
  rollbackStatus?: string;
  timestamp?: string;
}

export interface ExtractedRunFacts {
  promptSummary: string;
  changedFiles: string[];
  commandsRun: string[];
  testsRun: string[];
  validationResult: string;
  blockers: string[];
  nextSteps: string[];
  risks: string[];
  timestamp: string;
}

const asStrArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 30) : [];

const asStr = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v.slice(0, 500) : fallback;

const extractFromText = (text: string, pattern: RegExp): string[] => {
  const matches: string[] = [];
  for (const line of text.split('\n')) {
    if (pattern.test(line)) matches.push(line.trim().slice(0, 120));
    if (matches.length >= 10) break;
  }
  return matches;
};

export const extractChangedFiles = (input: RunExtractorInput): string[] => {
  const files = new Set<string>();
  for (const f of (input.changedFiles ?? [])) files.add(f);
  for (const f of asStrArr(input.agentResult?.['filesChanged'])) files.add(f);
  const text = (input.taskOutput ?? '') + (input.toolBatchSummary ?? '');
  for (const f of extractFromText(text, /\b(src|lib|test|tests|dist)\/[\w/.-]+\.[a-z]+\b/iu)) {
    const match = f.match(/\b(src|lib|test|tests|dist)\/[\w/.-]+\.[a-z]+\b/iu);
    if (match) files.add(match[0]);
  }
  return [...files].slice(0, 30);
};

export const extractCommandsRun = (input: RunExtractorInput): string[] => {
  const cmds = new Set<string>();
  for (const c of (input.commandsRun ?? [])) cmds.add(c);
  for (const c of asStrArr(input.agentResult?.['commandsRun'])) cmds.add(c);
  const text = (input.taskOutput ?? '') + (input.toolBatchSummary ?? '');
  for (const line of extractFromText(text, /^(npm|yarn|pnpm|npx|node|tsc|eslint|jest|vitest|git)\b/u)) {
    cmds.add(line.slice(0, 100));
  }
  return [...cmds].slice(0, 20);
};

export const extractTestsRun = (input: RunExtractorInput): string[] => {
  const tests = new Set<string>();
  for (const t of (input.testsRun ?? [])) tests.add(t);
  for (const t of asStrArr(input.agentResult?.['testsRun'])) tests.add(t);
  const text = (input.taskOutput ?? '') + (input.toolBatchSummary ?? '');
  for (const line of extractFromText(text, /\b(PASS|FAIL|passed|failed|skipped)\b.*\.(test|spec)\.[tj]s/iu)) {
    tests.add(line.slice(0, 100));
  }
  return [...tests].slice(0, 20);
};

export const extractBlockers = (input: RunExtractorInput): string[] => {
  const blockers = new Set<string>();
  for (const b of asStrArr(input.agentResult?.['blockers'])) blockers.add(b);
  for (const f of (input.failures ?? [])) blockers.add(f.slice(0, 200));
  const cgResult = input.completionGateResult;
  if (cgResult && asStr(cgResult['status']) === 'failed') {
    blockers.add(asStr(cgResult['reason'], 'Completion gate failed'));
  }
  if (input.rollbackStatus && input.rollbackStatus !== 'none') {
    blockers.add(`Rollback triggered: ${input.rollbackStatus.slice(0, 100)}`);
  }
  return [...blockers].slice(0, 10);
};

export const extractNextSteps = (input: RunExtractorInput): string[] => {
  const steps = new Set<string>();
  for (const s of asStrArr(input.agentResult?.['nextSteps'])) steps.add(s);
  const cgResult = input.completionGateResult;
  if (cgResult && typeof cgResult['nextSteps'] !== 'undefined') {
    for (const s of asStrArr(cgResult['nextSteps'])) steps.add(s);
  }
  return [...steps].slice(0, 10);
};

export const extractRunFacts = (input: RunExtractorInput): ExtractedRunFacts => {
  const agentResult = input.agentResult ?? {};
  const rawPrompt = input.prompt ?? asStr(agentResult['prompt']);
  const result = asStr(
    agentResult['finalMessage'] ?? agentResult['result'] ?? agentResult['status'],
    asStr(input.taskOutput, 'completed'),
  );
  const cgResult = input.completionGateResult ?? {};
  const cgStatus = asStr(cgResult['status']);
  const validationResult = cgStatus
    ? `${cgStatus}${cgStatus === 'failed' ? ` — ${asStr(cgResult['reason'])}` : ''}`
    : result.slice(0, 200);

  return {
    promptSummary: truncateForPrompt(rawPrompt, 300),
    changedFiles: extractChangedFiles(input),
    commandsRun: extractCommandsRun(input),
    testsRun: extractTestsRun(input),
    validationResult: redactProjectBrainText(validationResult.slice(0, 300)),
    blockers: extractBlockers(input).map((b) => redactProjectBrainText(b)),
    nextSteps: extractNextSteps(input).map((s) => redactProjectBrainText(s)),
    risks: asStrArr(agentResult['risks']).map((r) => redactProjectBrainText(r)).slice(0, 5),
    timestamp: input.timestamp ?? new Date().toISOString(),
  };
};

export const formatExtractedRunFacts = (facts: ExtractedRunFacts): string =>
  redactProjectBrainText([
    `## ${facts.timestamp}`,
    '',
    `Prompt: ${facts.promptSummary || '(not recorded)'}`,
    `Validation: ${facts.validationResult}`,
    `Files changed: ${facts.changedFiles.join(', ') || 'none'}`,
    `Commands run: ${facts.commandsRun.join(', ') || 'none'}`,
    `Tests run: ${facts.testsRun.join(', ') || 'none'}`,
    `Blockers: ${facts.blockers.join('; ') || 'none'}`,
    `Next steps: ${facts.nextSteps.join('; ') || 'none'}`,
    facts.risks.length > 0 ? `Risks: ${facts.risks.join('; ')}` : '',
    '',
  ].filter((line) => line !== null).join('\n'));
