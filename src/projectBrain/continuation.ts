import {readProjectBrain, formatProjectBrainSummary} from './reader.js';
import {truncateForPrompt, redactProjectBrainText} from './safety.js';
import type {ProjectBrainSummary} from './types.js';

const CONTINUE_RE = /\b(continue|keep going|next|resume|carry on|current plan)\b/iu;
const LARGE_BUILD_RE = /\b(build|create|implement|ship)\b[\s\S]{120,}\b(app|product|site|dashboard|platform|extension)\b/iu;

// Max chars for continuation context to stay within token budget
const MAX_CONTINUATION_CHARS = 4_000;
// Max chars per individual brain file section
const MAX_FILE_CHARS = 1_000;

export const detectContinuationIntent = (prompt: string): boolean => CONTINUE_RE.test(prompt.trim());

export const shouldSuggestProjectBrain = (prompt: string): boolean => LARGE_BUILD_RE.test(prompt);

export const suggestNextBrainTask = (summary: ProjectBrainSummary): string => {
  if (summary.status === 'missing') return 'Run `apeironcode brain plan` to preview a Project Brain.';
  if (summary.keyFilesMissing.length > 0) return `Repair missing Project Brain file: ${summary.keyFilesMissing[0]}`;
  return 'Open PLAN.md and TASKS.md, then continue the next unchecked task.';
};

/**
 * Extract the "current objective" from PLAN.md — first non-empty heading or first 3 lines.
 */
const extractCurrentObjective = (planContent: string): string => {
  const lines = planContent.split('\n');
  for (const line of lines.slice(0, 20)) {
    if (line.startsWith('#')) return line.replace(/^#+\s*/u, '').trim().slice(0, 120);
  }
  return lines.slice(0, 3).join(' ').trim().slice(0, 120);
};

/**
 * Extract the next unchecked task from TASKS.md.
 */
const extractNextTask = (tasksContent: string): string => {
  for (const line of tasksContent.split('\n')) {
    if (/^\s*-\s+\[ \]\s+.+/u.test(line)) return line.replace(/^\s*-\s+\[ \]\s+/u, '').trim().slice(0, 120);
  }
  return '';
};

/**
 * Extract the most recent run summary section header from RUNS.md.
 */
const extractRecentRunSummary = (runsContent: string): string => {
  const sections = runsContent.split(/^## /mu).filter(Boolean);
  const last = sections[sections.length - 1];
  if (!last) return '';
  return last.split('\n').slice(0, 5).join('\n').trim().slice(0, 300);
};

export const formatContinuationContext = async (cwd: string): Promise<string> => {
  const brain = await readProjectBrain(cwd, {maxCharsPerFile: 2_500});
  if (!brain.exists) {
    return 'Project Brain: missing. Continue normally; consider `apeironcode brain plan` for long app builds.';
  }

  const getFile = (name: string): string =>
    brain.files.find((f) => f.relativePath.endsWith(`/${name}.md`) || f.relativePath.endsWith(`\\${name}.md`))?.content ?? '';

  const plan = getFile('PLAN');
  const tasks = getFile('TASKS');
  const runs = getFile('RUNS');
  const verify = getFile('VERIFY');

  const objective = plan ? extractCurrentObjective(plan) : '';
  const nextTask = tasks ? extractNextTask(tasks) : '';
  const recentRun = runs ? extractRecentRunSummary(runs) : '';

  const parts: string[] = [
    formatProjectBrainSummary(brain.summary),
    '',
    objective ? `Current objective: ${objective}` : '',
    nextTask ? `Next task: ${nextTask}` : '',
    recentRun ? `Recent run:\n${recentRun}` : '',
    '',
    plan ? `## PLAN.md\n${truncateForPrompt(plan, MAX_FILE_CHARS)}` : '',
    tasks ? `## TASKS.md\n${truncateForPrompt(tasks, MAX_FILE_CHARS)}` : '',
    verify ? `## VERIFY.md\n${truncateForPrompt(verify, 600)}` : '',
  ].filter(Boolean);

  return truncateForPrompt(redactProjectBrainText(parts.join('\n')), MAX_CONTINUATION_CHARS);
};

export const buildContinuationPromptFromBrain = async (
  cwd: string,
  userPrompt: string,
): Promise<string> => {
  const context = await formatContinuationContext(cwd);
  return redactProjectBrainText([
    'Use this Project Brain continuation context when relevant.',
    context,
    '',
    'User request:',
    userPrompt,
  ].join('\n'));
};
