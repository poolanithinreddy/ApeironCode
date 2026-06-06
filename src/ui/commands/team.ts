import type {SlashCommandDefinition} from './shared.js';

export const createTeamCommands = (): SlashCommandDefinition[] => [
{
    description: 'Plan or run a sequential team workflow',
    examples: ['/team plan implement memory graph search', '/team run review current diff --workspace temp-copy', '/team review team_123', '/team run review auth --parallel-readonly --dry-run'],
    name: '/team',
    usage: '/team plan|run <task> [--workspace main|temp-copy|git-worktree] [--dry-run] [--parallel-readonly]',
    async run(args, context) {
      const {formatTeamPlan, formatTeamRunResult} = await import('../../agents/format.js');
      const {createTeamPlan} = await import('../../agents/teamPlanner.js');
      const {runTeamSequential} = await import('../../agents/teamRunner.js');
      const {formatParallelReadonlyLanePlan, planParallelReadonlyLanes} = await import('../../agents/parallelLanes.js');
      const {formatIgnoredFiles, formatMergePlans, formatWorkspaces} = await import('../../agents/workspace/format.js');
      const {SubagentWorkspaceManager} = await import('../../agents/workspace/workspaceManager.js');
      const {formatConflictReport} = await import('../../agents/workspace/conflictReport.js');
      const {exportTeamPatch, formatPatchValidation, formatResolutionState, loadResolutionState, setResolution, validateTeamPatch} = await import('../../agents/workspace/resolution.js');
      const {formatMergeResolution} = await import('../../agents/workspace/resolutionFormat.js');
      const {browseTeamRuns, listTeamArtifacts, showTeamArtifact, showTeamRun} = await import('../../agents/artifacts/browser.js');
      const {TeamArtifactStore} = await import('../../agents/artifacts/store.js');
      const {buildTeamReviewViewModel, formatTeamReview} = await import('../teamReviewViewModel.js');
      const {formatArtifactBrowser} = await import('../artifactBrowserViewModel.js');
      const [subcommand, ...taskParts] = args;
      const workspaceManager = new SubagentWorkspaceManager(context.cwd);
      if (subcommand === 'runs') {
        context.appendLocalAssistantMessage(await browseTeamRuns(context.cwd));
        return;
      }
      if (subcommand === 'show' && taskParts[0]) {
        context.appendLocalAssistantMessage(await showTeamRun(context.cwd, taskParts[0]));
        return;
      }
      if (subcommand === 'review' && taskParts[0]) {
        const artifactStore = new TeamArtifactStore(context.cwd);
        const [run, workspaces, mergePlans] = await Promise.all([
          artifactStore.getRun(taskParts[0]),
          workspaceManager.findByTeamRun(taskParts[0]),
          workspaceManager.createMergePlan(taskParts[0]),
        ]);
        if (taskParts.includes('interactive')) {
          const {MemorySuggestionStore} = await import('../../memory/suggestions.js');
          const {TeamEventLog} = await import('../../agents/eventLog.js');
          const memorySuggestions = (await new MemorySuggestionStore(context.cwd).list()).filter((suggestion) =>
            suggestion.relatedSessionId === taskParts[0] || JSON.stringify(suggestion.proposedFacts).includes(taskParts[0] ?? ''));
          if (run) {
            await new TeamEventLog(context.cwd).append({
              message: 'Review cockpit opened from slash command.',
              task: run.goal || run.teamRunId,
              teamRunId: run.teamRunId,
              type: 'cockpit_opened',
            });
          }
          context.setDashboard({
            mergePlans,
            memorySuggestions,
            run,
            title: `Review Cockpit: ${taskParts[0]}`,
            type: 'review-cockpit',
            workspaces,
          });
          context.appendLocalAssistantMessage(`Opened review cockpit for ${taskParts[0]}. Use arrow keys, ?, a/r/d/e, and q.`);
          return;
        }
        context.appendLocalAssistantMessage(formatTeamReview(buildTeamReviewViewModel({mergePlans, run, workspaces})));
        return;
      }
      if (subcommand === 'cockpit' && taskParts[0]) {
        const artifactStore = new TeamArtifactStore(context.cwd);
        const {MemorySuggestionStore} = await import('../../memory/suggestions.js');
        const {TeamEventLog} = await import('../../agents/eventLog.js');
        const [run, workspaces, mergePlans, memorySuggestions] = await Promise.all([
          artifactStore.getRun(taskParts[0]),
          workspaceManager.findByTeamRun(taskParts[0]),
          workspaceManager.createMergePlan(taskParts[0]),
          new MemorySuggestionStore(context.cwd).list(),
        ]);
        if (run) {
          await new TeamEventLog(context.cwd).append({
            message: 'Review cockpit opened from slash command.',
            task: run.goal || run.teamRunId,
            teamRunId: run.teamRunId,
            type: 'cockpit_opened',
          });
        }
        context.setDashboard({
          mergePlans,
          memorySuggestions: memorySuggestions.filter((suggestion) =>
            suggestion.relatedSessionId === taskParts[0] || JSON.stringify(suggestion.proposedFacts).includes(taskParts[0] ?? '')),
          run,
          title: `Review Cockpit: ${taskParts[0]}`,
          type: 'review-cockpit',
          workspaces,
        });
        context.appendLocalAssistantMessage(`Opened review cockpit for ${taskParts[0]}. Use arrow keys, ?, a/r/d/e, and q.`);
        return;
      }
      if (subcommand === 'artifacts' && taskParts[0]) {
        const run = await new TeamArtifactStore(context.cwd).getRun(taskParts[0]);
        context.appendLocalAssistantMessage(run ? formatArtifactBrowser(run.artifacts, taskParts[0], null, {filter: taskParts[1]}) : await listTeamArtifacts(context.cwd, taskParts[0]));
        return;
      }
      if (subcommand === 'artifact' && taskParts[0] && taskParts[1]) {
        const store = new TeamArtifactStore(context.cwd);
        const [run, selected] = await Promise.all([
          store.getRun(taskParts[0]),
          store.readArtifact(taskParts[0], taskParts[1]),
        ]);
        context.appendLocalAssistantMessage(run && selected ? formatArtifactBrowser(run.artifacts, taskParts[0], {artifactId: selected.artifact.id, content: selected.content}) : await showTeamArtifact(context.cwd, taskParts[0], taskParts[1]));
        return;
      }
      if (subcommand === 'workspaces') {
        context.appendLocalAssistantMessage(formatWorkspaces(await workspaceManager.listWorkspaces()));
        return;
      }
      if (subcommand === 'merge-plan' && taskParts[0]) {
        context.appendLocalAssistantMessage(formatMergePlans(await workspaceManager.createMergePlan(taskParts[0])));
        return;
      }
      if (subcommand === 'ignored' && taskParts[0]) {
        const workspaces = await workspaceManager.findByTeamRun(taskParts[0]);
        context.appendLocalAssistantMessage(formatIgnoredFiles(await Promise.all(workspaces.map((workspace) => workspaceManager.collectDiff(workspace)))));
        return;
      }
      if (subcommand === 'conflicts' && taskParts[0]) {
        const plans = await workspaceManager.createMergePlan(taskParts[0]);
        const filtered = taskParts[1]
          ? plans.map((plan) => ({
              ...plan,
              conflictDetails: plan.conflictDetails?.filter((conflict) => conflict.path === taskParts[1]) ?? [],
              conflicts: plan.conflicts.filter((conflictPath) => conflictPath === taskParts[1]),
            }))
          : plans;
        context.appendLocalAssistantMessage(formatConflictReport(filtered));
        return;
      }
      if (subcommand === 'apply' && taskParts[0]) {
        const config = context.getResolvedConfig();
        if (config.effective.approvalMode !== 'trusted' && config.effective.approvalMode !== 'bypass') {
          context.appendLocalAssistantMessage('Team merge apply requires approvalMode trusted/bypass. Run /team merge-plan <id> first and approve explicitly.');
          return;
        }
        const applied = await workspaceManager.apply(taskParts[0]);
        context.appendLocalAssistantMessage(`Applied ${applied.length} file change${applied.length === 1 ? '' : 's'} from ${taskParts[0]}.\n${applied.join('\n')}`);
        context.refreshSessionState();
        return;
      }
      if (subcommand === 'resolve' && taskParts[0]) {
        if (taskParts[1] && taskParts[2]) {
          if (taskParts[2] !== 'skip' && taskParts[2] !== 'manual' && taskParts[2] !== 'apply') {
            context.appendLocalAssistantMessage('Usage: /team resolve <id> <file> skip|manual|apply');
            return;
          }
          context.appendLocalAssistantMessage(formatResolutionState(await setResolution(context.cwd, taskParts[0], taskParts[1], taskParts[2])));
          return;
        }
        context.appendLocalAssistantMessage(formatMergeResolution(taskParts[0], await workspaceManager.createMergePlan(taskParts[0]), await loadResolutionState(context.cwd, taskParts[0])));
        return;
      }
      if (subcommand === 'export-patch' && taskParts[0]) {
        context.appendLocalAssistantMessage(`Patch export written: ${await exportTeamPatch(context.cwd, taskParts[0], {
          file: taskParts.includes('--file') ? taskParts[taskParts.indexOf('--file') + 1] : undefined,
          includeConflicts: taskParts.includes('--include-conflicts'),
        })}`);
        return;
      }
      if (subcommand === 'validate-patch' && taskParts[0]) {
        context.appendLocalAssistantMessage(formatPatchValidation(await validateTeamPatch(context.cwd, taskParts[0], taskParts[1])));
        return;
      }
      if (subcommand === 'discard' && taskParts[0]) {
        const count = await workspaceManager.discard(taskParts[0]);
        context.appendLocalAssistantMessage(`Discarded ${count} workspace${count === 1 ? '' : 's'} for ${taskParts[0]}.`);
        return;
      }
      if ((subcommand !== 'plan' && subcommand !== 'run') || taskParts.length === 0) {
        context.appendLocalAssistantMessage('Usage: /team plan|run <task> [--workspace main|temp-copy|git-worktree] [--dry-run]');
        return;
      }
      let dryRun = false;
      let parallelReadonly = false;
      let workspaceMode: 'main' | 'temp-copy' | 'git-worktree' = 'main';
      const cleanedTaskParts: string[] = [];
      for (let index = 0; index < taskParts.length; index += 1) {
        const part = taskParts[index];
        if (!part) {
          continue;
        }
        if (part === '--dry-run') {
          dryRun = true;
          continue;
        }
        if (part === '--parallel-readonly') {
          parallelReadonly = true;
          continue;
        }
        if (part === '--workspace') {
          const next = taskParts[index + 1];
          if (next === 'main' || next === 'temp-copy' || next === 'git-worktree') {
            workspaceMode = next;
            index += 1;
            continue;
          }
          context.appendLocalAssistantMessage('Workspace mode must be one of: main, temp-copy, git-worktree.');
          return;
        }
        cleanedTaskParts.push(part);
      }
      const task = cleanedTaskParts.join(' ');
      if (!task) {
        context.appendLocalAssistantMessage('Usage: /team plan|run <task> [--workspace main|temp-copy|git-worktree] [--dry-run]');
        return;
      }
      if (subcommand === 'plan') {
        const plan = createTeamPlan(task);
        context.appendLocalAssistantMessage(`${formatTeamPlan(plan)}${parallelReadonly ? `\n\n${formatParallelReadonlyLanePlan(planParallelReadonlyLanes(plan))}` : ''}`);
        return;
      }
      if (dryRun) {
        const plan = createTeamPlan(task);
        context.appendLocalAssistantMessage(`${formatTeamPlan(plan)}${parallelReadonly ? `\n\n${formatParallelReadonlyLanePlan(planParallelReadonlyLanes(plan))}` : ''}\n\nWorkspace mode: ${workspaceMode}\nDry run only. Use without --dry-run to execute subagents sequentially.`);
        return;
      }
      const result = await runTeamSequential(task, {
        config: context.getResolvedConfig(),
        cwd: context.cwd,
        workspaceMode,
      });
      context.appendLocalAssistantMessage(formatTeamRunResult(result));
      context.refreshSessionState();
    },
  },
];
