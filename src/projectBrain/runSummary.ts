import path from 'node:path';

import {fileExists, readTextFile, writeTextFile} from '../utils/fs.js';
import {PROJECT_BRAIN_DIR} from './types.js';
import {redactProjectBrainText, truncateForPrompt} from './safety.js';

export interface ProjectBrainRunSummary {
  prompt: string;
  filesChanged: string[];
  commandsRun: string[];
  testsRun: string[];
  result: string;
  nextSteps: string[];
  blockers: string[];
  createdAt: string;
}

export interface AppendRunSummaryOptions {
  approved?: boolean;
  enabled?: boolean;
}

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 20) : [];

const asString = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value : fallback;

export const createRunSummaryFromAgentResult = (
  result: Record<string, unknown>,
  options: {prompt?: string; now?: string} = {},
): ProjectBrainRunSummary => ({
  blockers: asStringArray(result['blockers']),
  commandsRun: asStringArray(result['commandsRun']),
  createdAt: options.now ?? new Date().toISOString(),
  filesChanged: asStringArray(result['filesChanged']),
  nextSteps: asStringArray(result['nextSteps']),
  prompt: truncateForPrompt(options.prompt ?? asString(result['prompt'], ''), 500),
  result: truncateForPrompt(
    asString(result['finalMessage'], asString(result['result'], asString(result['status'], 'completed'))),
    800,
  ),
  testsRun: asStringArray(result['testsRun']),
});

export const formatRunSummary = (summary: ProjectBrainRunSummary): string => redactProjectBrainText([
  `## ${summary.createdAt}`,
  '',
  `Prompt: ${summary.prompt || '(not recorded)'}`,
  `Result: ${summary.result}`,
  `Files changed: ${summary.filesChanged.join(', ') || 'none recorded'}`,
  `Commands run: ${summary.commandsRun.join(', ') || 'none recorded'}`,
  `Tests run: ${summary.testsRun.join(', ') || 'none recorded'}`,
  `Next steps: ${summary.nextSteps.join('; ') || 'none recorded'}`,
  `Blockers: ${summary.blockers.join('; ') || 'none'}`,
  '',
].join('\n'));

export const appendRunSummary = async (
  cwd: string,
  summary: ProjectBrainRunSummary,
  options: AppendRunSummaryOptions = {},
): Promise<boolean> => {
  if (!options.enabled || !options.approved) return false;
  const runsPath = path.join(cwd, PROJECT_BRAIN_DIR, 'RUNS.md');
  if (!(await fileExists(runsPath))) return false;
  const existing = await readTextFile(runsPath);
  await writeTextFile(runsPath, `${existing.trimEnd()}\n\n${formatRunSummary(summary)}`);
  return true;
};
