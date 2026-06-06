/**
 * CLI handlers for background tasks and worktrees (Phase 16D).
 */

import type {CliHandlers} from '../commands.js';
import type {BgTaskCreateOptions} from '../commands/types.js';
import type {BootstrapRuntimeContext} from './runtimeContext.js';
import {BgTaskStore} from '../../tasks/bgTaskStore.js';
import {TaskRunner} from '../../tasks/bgTaskRunner.js';
import {formatTaskSummary, formatTaskList} from '../../tasks/bgTask.js';
import type {BgTaskKind, BgTaskFilter} from '../../tasks/bgTask.js';
import {
  listAgentWorktrees,
  getAgentWorktree,
  removeAgentWorktree,
  formatWorktreeSummary,
  reconcileAgentWorktrees,
} from '../../agents/worktreeManager.js';
import {getProjectTrustStatus} from '../../safety/projectTrust.js';
import {loadCommandDefinitions} from '../../workflows/commands/loader.js';
import {renderCommandPrompt} from '../../workflows/commands/runner.js';
import {buildTaskResumePlan, formatTaskResumePlan} from '../../tasks/taskResume.js';
import {buildRealAgentRunner} from '../../tasks/agentTaskRunner.js';
import {providerRegistry} from '../../providers/registry.js';
import {createDefaultToolRegistry} from '../../tools/registry.js';

/** Task kinds that run through the Agent loop (not shell/workflow). */
const AGENT_KINDS = new Set<BgTaskKind>(['agent', 'review', 'test-fix']);

const VALID_KINDS = new Set(['agent', 'shell', 'review', 'test-fix', 'workflow']);

const toTaskKind = (raw: string | undefined): BgTaskKind => {
  if (raw && VALID_KINDS.has(raw)) return raw as BgTaskKind;
  return 'agent';
};

export const createBgTaskHandlers = ({cwd, configStore}: BootstrapRuntimeContext): Partial<CliHandlers> => {
  const makeStore = (): BgTaskStore => new BgTaskStore(cwd);

  /** Build a TaskRunner with a live AgentRunner wired for agent/review/test-fix kinds. */
  const makeRunner = (store: BgTaskStore, kind?: BgTaskKind): TaskRunner => {
    if (kind && AGENT_KINDS.has(kind)) {
      const agentRunner = buildRealAgentRunner({
        getConfig: () => configStore.load(),
        getProviderRegistry: () => Promise.resolve(providerRegistry),
        getToolRegistry: () => Promise.resolve(createDefaultToolRegistry()),
      });
      return new TaskRunner(store, {agentRunner});
    }
    return new TaskRunner(store);
  };

  return {
    async bgTaskCreate(prompt: string, options?: BgTaskCreateOptions): Promise<void> {
      const store = makeStore();
      const kind = toTaskKind(options?.kind);
      const isolation = options?.worktree ? 'worktree' as const : 'none' as const;

      // Resolve markdown command if --command specified
      let resolvedPrompt = prompt;
      if (kind === 'workflow' && options?.command) {
        const trustLevel = getProjectTrustStatus(cwd).trust;
        const commandResults = loadCommandDefinitions(cwd, {skipTrustCheck: trustLevel === 'trusted'});
        const found = commandResults.find(
          (r) => r.definition?.name === options.command || r.definition?.aliases.includes(options.command ?? ''),
        );
        if (!found || !found.definition) {
          process.stdout.write(`Markdown command not found or blocked: ${options.command}\n`);
          return;
        }
        if (found.trustStatus === 'blocked') {
          process.stdout.write(`Command "${options.command}" requires trust. Run "apeironcode trust" first.\n`);
          return;
        }
        resolvedPrompt = renderCommandPrompt(found.definition, prompt);
      }

      const task = await store.createTask({
        title: prompt.slice(0, 80),
        kind,
        cwd,
        prompt: resolvedPrompt,
        isolation,
        agentName: options?.agent,
        skillNames: options?.skill,
        workflowCommandName: options?.command,
      });

      process.stdout.write(`Task created: ${task.id.slice(0, 8)} [${task.kind}] ${task.title}\n`);
      process.stdout.write(`Status: ${task.status}\n`);

      if (options?.start) {
        const path = AGENT_KINDS.has(kind) ? 'Agent loop' : kind;
        process.stdout.write(`Starting task via ${path}...\n`);
        const runner = makeRunner(store, kind);
        const result = await runner.startTask(task.id);
        if (result) {
          process.stdout.write(`${formatTaskSummary(result)}\n`);
          if (result.outputSummary) process.stdout.write(`Output: ${result.outputSummary}\n`);
          if (result.errorSummary) process.stdout.write(`Error: ${result.errorSummary}\n`);
        }
      } else {
        process.stdout.write('Task queued. Run with --start to execute, or use "apeironcode task resume" later.\n');
      }
    },

    async bgTaskList(options?: {status?: string; kind?: string}): Promise<void> {
      const store = makeStore();
      const filter: BgTaskFilter = {};
      if (options?.status) filter.status = options.status as BgTaskFilter['status'];
      if (options?.kind) filter.kind = options.kind as BgTaskFilter['kind'];
      const tasks = await store.listTasks(filter);
      process.stdout.write(formatTaskList(tasks) + '\n');
    },

    async bgTaskShow(taskId: string): Promise<void> {
      const store = makeStore();
      const task = await store.getTask(taskId);
      if (!task) {
        process.stdout.write(`Task not found: ${taskId}\n`);
        return;
      }
      process.stdout.write(formatTaskSummary(task) + '\n');
      if (task.worktreePath) process.stdout.write(`Worktree: ${task.worktreePath}\n`);
      if (task.branchName) process.stdout.write(`Branch: ${task.branchName}\n`);
      if (task.agentName) process.stdout.write(`Agent: ${task.agentName}\n`);
      if (task.skillNames?.length) process.stdout.write(`Skills: ${task.skillNames.join(', ')}\n`);
    },

    async bgTaskOutput(taskId: string): Promise<void> {
      const store = makeStore();
      const runner = makeRunner(store); // output doesn't run the agent, no runner needed
      process.stdout.write((await runner.getTaskOutput(taskId)) + '\n');
    },

    async bgTaskStop(taskId: string): Promise<void> {
      const store = makeStore();
      const runner = makeRunner(store); // stop doesn't execute the agent
      const result = await runner.stopTask(taskId);
      process.stdout.write(result ? `Task stopped: ${formatTaskSummary(result)}\n` : `Task not found: ${taskId}\n`);
    },

    async bgTaskResume(taskId: string): Promise<void> {
      const store = makeStore();
      const task = await store.getTask(taskId);
      if (!task) {
        process.stdout.write(`Task not found: ${taskId}\n`);
        return;
      }
      const plan = await buildTaskResumePlan(task);
      process.stdout.write(`Resume strategy: ${plan.strategy}\n${formatTaskResumePlan(plan)}\n`);

      // Resume uses the agent runner so the task actually executes
      const runner = makeRunner(store, task.kind);
      const result = await runner.resumeTask(taskId);
      process.stdout.write(result ? `${formatTaskSummary(result)}\n` : `Task not found: ${taskId}\n`);
    },

    async worktreeList(): Promise<void> {
      const report = await reconcileAgentWorktrees(cwd).catch(() => null);
      const worktrees = report?.worktrees ?? await listAgentWorktrees(cwd);
      if (worktrees.length === 0) {
        process.stdout.write('No ApeironCode worktrees found.\n');
        return;
      }
      for (const wt of worktrees) {
        const missing = report?.missing.includes(wt.id) ? ' [missing from git]' : '';
        process.stdout.write(`${wt.id.slice(0, 8)} [${wt.status}${missing}] ${wt.branchName} — ${wt.purpose}\n`);
      }
    },

    async worktreeShow(id: string): Promise<void> {
      const wt = await getAgentWorktree(cwd, id);
      if (!wt) {
        process.stdout.write(`Worktree not found: ${id}\n`);
        return;
      }
      process.stdout.write(formatWorktreeSummary(wt) + '\n');
    },

    async worktreeRemove(id: string, options?: {yes?: boolean}): Promise<void> {
      if (!options?.yes) {
        process.stdout.write('Refusing to remove worktree without --yes. This will delete the branch and directory.\n');
        process.stdout.write(`Run: apeironcode worktree remove ${id} --yes\n`);
        return;
      }
      try {
        await removeAgentWorktree({id, cwd, yes: true});
        process.stdout.write(`Worktree removed: ${id}\n`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stdout.write(`Failed to remove worktree: ${msg}\n`);
      }
    },
  };
};
