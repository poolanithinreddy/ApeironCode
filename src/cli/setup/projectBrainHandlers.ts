import path from 'node:path';

import type {CliHandlers} from '../commands.js';
import type {BootstrapRuntimeContext} from './runtimeContext.js';
import {
  applyProjectBrainInitPlan,
  buildRuntimeBrainContext,
  createProjectBrainInitPlan,
  createRunSummaryFromAgentResult,
  formatProjectBrainInitPlan,
  formatProjectBrainInitResult,
  formatProjectBrainSummary,
  formatRunSummary,
  formatRuntimeBrainContextDebug,
  formatRuntimeBrainIntent,
  readProjectBrain,
} from '../../projectBrain/index.js';

const extractSection = (content: string, title: string): string => {
  const marker = `# ${title}`;
  const index = content.indexOf(marker);
  return index >= 0 ? content.slice(index, index + 1_500) : content.slice(0, 1_500);
};

export const createProjectBrainHandlers = ({cwd}: BootstrapRuntimeContext): Partial<CliHandlers> => ({
  async brainPlan() {
    const plan = await createProjectBrainInitPlan(cwd);
    process.stdout.write(`${formatProjectBrainInitPlan(plan)}\n`);
  },
  async brainInit(options?: {dryRun?: boolean; yes?: boolean}) {
    const plan = await createProjectBrainInitPlan(cwd);
    const result = await applyProjectBrainInitPlan(plan, {
      approved: options?.yes === true,
      dryRun: options?.dryRun,
      mergeStrategy: 'preserve',
    });
    process.stdout.write(`${formatProjectBrainInitResult(result)}\n`);
  },
  async brainStatus() {
    const brain = await readProjectBrain(cwd);
    process.stdout.write(`${formatProjectBrainSummary(brain.summary)}\n`);
  },
  async brainShow() {
    const brain = await readProjectBrain(cwd);
    process.stdout.write(`${formatProjectBrainSummary(brain.summary)}\n`);
    if (brain.exists) {
      process.stdout.write('\nSafe files:\n');
      for (const file of brain.files) process.stdout.write(`- ${file.relativePath}\n`);
    }
  },
  async brainTasks() {
    const brain = await readProjectBrain(cwd, {maxCharsPerFile: 2_000});
    const tasks = brain.files.find((file) => file.relativePath.endsWith('/TASKS.md'));
    process.stdout.write(tasks ? `${extractSection(tasks.content, 'Tasks')}\n` : 'Project Brain TASKS.md not found.\n');
  },
  async brainMemory() {
    const brain = await readProjectBrain(cwd, {maxCharsPerFile: 2_000});
    const memory = brain.files.find((file) => file.relativePath.endsWith('/MEMORY.md'));
    process.stdout.write(memory ? `${memory.content}\n` : 'Project Brain MEMORY.md not found.\n');
  },
  async brainRuntime(prompt: string) {
    const ctx = await buildRuntimeBrainContext(cwd, prompt);
    process.stdout.write(`${formatRuntimeBrainIntent(ctx.intentResult)}\n`);
    if (ctx.brainPresent) {
      process.stdout.write(`Brain present: yes\nEstimated tokens: ${ctx.estimatedTokens}\n`);
    } else {
      process.stdout.write('Brain present: no\n');
    }
    if (ctx.warnings.length > 0) {
      process.stdout.write(`Warnings: ${ctx.warnings.join('; ')}\n`);
    }
    if (ctx.promptInjection) {
      process.stdout.write(`\nInjection preview (first 400 chars):\n${ctx.promptInjection.slice(0, 400)}\n`);
    }
  },
  async brainExplain(prompt: string) {
    const ctx = await buildRuntimeBrainContext(cwd, prompt);
    process.stdout.write(`${formatRuntimeBrainContextDebug(ctx)}\n`);
  },
  async brainUpdate(options?: {summary?: string; yes?: boolean}) {
    if (!options?.yes) {
      process.stdout.write('Refused: brain update requires --yes.\n');
      return;
    }
    const {appendRunSummary} = await import('../../projectBrain/runSummary.js');
    const summary = createRunSummaryFromAgentResult(
      {finalMessage: options.summary ?? 'Manual Project Brain update', status: 'completed'},
      {prompt: 'apeironcode brain update'},
    );
    const appended = await appendRunSummary(cwd, summary, {approved: true, enabled: true});
    process.stdout.write(appended ? `${formatRunSummary(summary)}` : `Project Brain RUNS.md not found at ${path.join('.apeironcode', 'RUNS.md')}.\n`);
  },
});
