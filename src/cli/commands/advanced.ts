import type {Command} from 'commander';

import type {LspCliOptions} from '../args.js';
import type {CliHandlers} from './types.js';

export const registerAdvancedCommands = (program: Command, handlers: CliHandlers): void => {
  const lspCommand = program.command('lsp').description('language server protocol features');

  lspCommand
    .command('status')
    .description('show LSP server availability for this workspace')
    .option('--language <language>', 'check status for specific language')
    .action(async (options: LspCliOptions) => {
      await handlers.lspStatus(options);
    });

  lspCommand
    .command('sessions')
    .description('show active long-lived LSP sessions in this process')
    .option('--language <language>', 'filter sessions by language')
    .action(async (options: LspCliOptions) => {
      await handlers.lspSessions(options);
    });

  lspCommand
    .command('restart')
    .description('restart active long-lived LSP sessions in this process')
    .option('--language <language>', 'restart sessions for a specific language')
    .action(async (options: LspCliOptions) => {
      await handlers.lspRestart(options);
    });

  lspCommand
    .command('stop')
    .description('stop active long-lived LSP sessions in this process')
    .option('--language <language>', 'stop sessions for a specific language')
    .action(async (options: LspCliOptions) => {
      await handlers.lspStop(options);
    });

  const lspCacheCommand = lspCommand
    .command('cache')
    .description('show long-lived LSP cache state for this process')
    .action(async () => {
      await handlers.lspCache();
    });

  lspCacheCommand
    .command('clear')
    .description('clear the long-lived LSP cache for this process')
    .action(async () => {
      await handlers.lspCacheClear();
    });

  lspCommand
    .command('diagnostics')
    .description('show LSP diagnostics')
    .argument('[file]', 'optional file path to check diagnostics for')
    .action(async (file: string | undefined, options: LspCliOptions) => {
      await handlers.lspDiagnostics(file, options);
    });

  lspCommand
    .command('definition')
    .description('look up definition via live LSP')
    .argument('[file]', 'file path')
    .argument('[line]', 'line number (1-indexed)')
    .argument('[character]', 'character position (0-indexed)')
    .action(async (file: string | undefined, line: string | undefined, character: string | undefined, options: LspCliOptions) => {
      await handlers.lspDefinition(file, line, character, options);
    });

  lspCommand
    .command('references')
    .description('find references via live LSP')
    .argument('[file]', 'file path')
    .argument('[line]', 'line number (1-indexed)')
    .argument('[character]', 'character position (0-indexed)')
    .action(async (file: string | undefined, line: string | undefined, character: string | undefined, options: LspCliOptions) => {
      await handlers.lspReferences(file, line, character, options);
    });

  lspCommand
    .command('symbols')
    .description('show LSP symbols in a file')
    .argument('<file>', 'file path to get symbols for')
    .action(async (file: string, options: LspCliOptions) => {
      await handlers.lspSymbols(file, options);
    });

  const agentsCommand = program.command('agents').description('list built-in specialized agents');
  agentsCommand.action(async () => {
    await handlers.agents();
  });

  const agentCommand = program.command('agent').description('inspect or run a specialized subagent task');
  agentCommand.command('show').argument('<name>', 'agent name').description('show an agent').action(async (name: string) => {
    await handlers.agentShow(name);
  });
  agentCommand.command('run').argument('<name>', 'agent name').argument('<task>', 'task').description('prepare a scoped subagent run').action(async (name: string, task: string) => {
    await handlers.agentRun(name, task);
  });

  const teamCommand = program.command('team').description('plan or run a sequential agent team workflow');
  teamCommand.command('plan').argument('<task>', 'task').option('--parallel-readonly', 'show safe read-only lanes that can be scheduled independently').description('create a sequential team plan').action(async (task: string, options: {parallelReadonly?: boolean}) => {
    await handlers.teamPlan(task, options);
  });
  teamCommand.command('run').argument('<task>', 'task').option('--dry-run', 'show the sequential team plan without executing subagents').option('--workspace <mode>', 'workspace mode: main | temp-copy | git-worktree').option('--parallel-readonly', 'schedule safe read-only lanes separately; editing lanes stay sequential').description('execute a sequential team run').action(async (task: string, options: {dryRun?: boolean; parallelReadonly?: boolean; workspace?: string}) => {
    await handlers.teamRun(task, options);
  });
  teamCommand.command('workspaces').description('list subagent workspaces').action(async () => {
    await handlers.teamWorkspaces();
  });
  teamCommand.command('runs').description('list recorded team runs').action(async () => {
    await handlers.teamRuns();
  });
  teamCommand.command('show').argument('<teamRunId>', 'team run id').description('show a team run artifact summary').action(async (teamRunId: string) => {
    await handlers.teamRunShow(teamRunId);
  });
  teamCommand.command('review').argument('<teamRunId>', 'team run id').option('--interactive', 'show the review cockpit view').description('show a rich team run review surface').action(async (teamRunId: string, options: {interactive?: boolean}) => {
    await handlers.teamReview(teamRunId, options);
  });
  teamCommand.command('cockpit').argument('<teamRunId>', 'team run id').description('open the command-driven team review cockpit').action(async (teamRunId: string) => {
    await handlers.teamCockpit(teamRunId);
  });
  teamCommand.command('artifacts').argument('<teamRunId>', 'team run id').option('--filter <type>', 'filter artifacts by type').option('--search <query>', 'search artifact id, type, or title').description('list team run artifacts').action(async (teamRunId: string, options: {filter?: string; search?: string}) => {
    await handlers.teamArtifacts(teamRunId, options);
  });
  teamCommand.command('artifact').argument('<teamRunId>', 'team run id').argument('<artifactId>', 'artifact id').option('--preview', 'show preview metadata and truncated content').description('show a team run artifact').action(async (teamRunId: string, artifactId: string, options: {preview?: boolean}) => {
    await handlers.teamArtifact(teamRunId, artifactId, options);
  });
  teamCommand.command('export').argument('<teamRunId>', 'team run id').description('print a local team run export').action(async (teamRunId: string) => {
    await handlers.teamExport(teamRunId);
  });
  teamCommand.command('merge-plan').argument('<teamRunId>', 'team run id').description('show merge plan for isolated workspaces').action(async (teamRunId: string) => {
    await handlers.teamMergePlan(teamRunId);
  });
  teamCommand.command('conflicts').argument('<teamRunId>', 'team run id').option('--file <path>', 'filter to one file').option('--json', 'print conflict details as JSON').description('show conflict report for isolated workspaces').action(async (teamRunId: string, options: {file?: string; json?: boolean}) => {
    await handlers.teamConflicts(teamRunId, options);
  });
  teamCommand.command('apply').argument('<teamRunId>', 'team run id').option('--file <path>', 'apply one clean file').option('--force', 'allow apply even when patch validation fails').description('apply isolated workspace changes after approval').action(async (teamRunId: string, options: {file?: string; force?: boolean}) => {
    await handlers.teamApply(teamRunId, options);
  });
  teamCommand.command('resolve').argument('<teamRunId>', 'team run id').option('--file <path>', 'file path to mark').option('--action <action>', 'skip | manual | apply').description('record or show merge-resolution state').action(async (teamRunId: string, options: {action?: string; file?: string}) => {
    await handlers.teamResolve(teamRunId, options);
  });
  teamCommand.command('export-patch').argument('<teamRunId>', 'team run id').option('--include-conflicts', 'include conflicted files in the exported patch').option('--file <path>', 'export one file only').description('write a git-apply-oriented patch artifact for a team run').action(async (teamRunId: string, options: {file?: string; includeConflicts?: boolean}) => {
    await handlers.teamExportPatch(teamRunId, options);
  });
  teamCommand.command('validate-patch').argument('<teamRunId>', 'team run id').argument('[patchPath]', 'patch path to validate; defaults to latest team patch').description('validate an exported team patch with git apply --check when possible').action(async (teamRunId: string, patchPath?: string) => {
    await handlers.teamValidatePatch(teamRunId, patchPath);
  });
  teamCommand.command('ignored').argument('<teamRunId>', 'team run id').description('show workspace files ignored during merge planning').action(async (teamRunId: string) => {
    await handlers.teamIgnored(teamRunId);
  });
  teamCommand.command('discard').argument('<teamRunId>', 'team run id').description('discard isolated team workspaces').action(async (teamRunId: string) => {
    await handlers.teamDiscard(teamRunId);
  });
  const teamWorkspaceCommand = teamCommand.command('workspace').description('manage team workspaces');
  teamWorkspaceCommand.command('cleanup').description('remove applied/discarded workspace records and temp dirs').action(async () => {
    await handlers.teamWorkspaceCleanup();
  });

  const hooksCommand = program.command('hooks').description('list lifecycle hooks');
  hooksCommand.action(async () => {
    await handlers.hooks();
  });

  const hookCommand = program.command('hook').description('manage lifecycle hooks');
  hookCommand.command('list').description('list hooks').action(async () => {
    await handlers.hookList();
  });
  hookCommand.command('show').argument('<name>', 'hook name').description('show a hook').action(async (name: string) => {
    await handlers.hookShow(name);
  });
  hookCommand.command('test').argument('<name>', 'hook name').description('test a hook without implicit shell approval').action(async (name: string) => {
    await handlers.hookTest(name);
  });
  hookCommand.command('events').description('show recent hook execution events').action(async () => {
    await handlers.hookEvents();
  });
  hookCommand.command('enable').argument('<name>', 'hook name').description('enable a hook').action(async (name: string) => {
    await handlers.hookEnable(name);
  });
  hookCommand.command('disable').argument('<name>', 'hook name').description('disable a hook').action(async (name: string) => {
    await handlers.hookDisable(name);
  });

  const githubCommand = program.command('github').description('safe GitHub connector commands');
  githubCommand.command('status').description('show connector readiness').action(async () => {
    await handlers.githubStatus();
  });
  githubCommand.command('repo').description('show detected GitHub repository').action(async () => {
    await handlers.githubRepo();
  });
  githubCommand.command('issues').description('list open issues').action(async () => {
    await handlers.githubIssues();
  });
  const githubIssueCommand = githubCommand.command('issue').description('show or comment on an issue');
  githubIssueCommand.argument('[number]', 'issue number').action(async (number?: string) => {
    if (!number) {
      await handlers.githubIssues();
      return;
    }
    await handlers.githubIssue(number);
  });
  githubIssueCommand
    .command('comment')
    .argument('<number>', 'issue number')
    .argument('<text>', 'comment text')
    .description('comment on an issue with approval')
    .option('--dry-run', 'preview without posting')
    .action(async (number: string, text: string, options: {dryRun?: boolean}) => {
      await handlers.githubIssueComment(number, text, options);
    });
  githubIssueCommand
    .command('create')
    .description('create an issue with approval')
    .option('--title <title>', 'issue title')
    .option('--body <body>', 'issue body')
    .option('--dry-run', 'preview without posting')
    .action(async (options: {body?: string; dryRun?: boolean; title?: string}) => {
      await handlers.githubIssueCreate(options);
    });
  githubCommand
    .command('issue-comment')
    .argument('<number>', 'issue number')
    .argument('<text>', 'comment text')
    .description('comment on an issue with approval; alias for github issue comment')
    .option('--dry-run', 'preview without posting')
    .action(async (number: string, text: string, options: {dryRun?: boolean}) => {
      await handlers.githubIssueComment(number, text, options);
    });
  githubCommand.command('prs').description('list open pull requests').action(async () => {
    await handlers.githubPrs();
  });
  const githubPrCommand = githubCommand.command('pr').description('show or review a pull request');
  githubPrCommand.argument('[number]', 'pull request number').action(async (number?: string) => {
    if (!number) {
      await handlers.githubPrs();
      return;
    }
    await handlers.githubPr(number);
  });
  githubPrCommand.command('summary').argument('<number>', 'pull request number').description('summarize a pull request and changed files').action(async (number: string) => {
    await handlers.githubPrSummary(number);
  });
  githubPrCommand.command('review').argument('<number>', 'pull request number').description('create a local PR review report').option('--dry-run', 'preview without posting').option('--post', 'post the review as an approval-gated PR comment').action(async (number: string, options: {dryRun?: boolean; post?: boolean}) => {
    await handlers.githubPrReview(number, options);
  });
  githubPrCommand.command('comment').argument('<number>', 'pull request number').argument('<text>', 'comment text').option('--dry-run', 'preview without posting').description('comment on a pull request with approval').action(async (number: string, text: string, options: {dryRun?: boolean}) => {
    await handlers.githubPrComment(number, text, options);
  });
  githubPrCommand.command('create').description('create a pull request with approval').option('--title <title>', 'PR title').option('--body <body>', 'PR body').option('--base <base>', 'base branch').option('--head <head>', 'head branch').option('--dry-run', 'preview without posting').action(async (options: {base?: string; body?: string; dryRun?: boolean; head?: string; title?: string}) => {
    await handlers.githubPrCreate(options);
  });
  githubCommand.command('actions').argument('[runId]', 'GitHub Actions run id').description('list workflow runs or inspect jobs for a run').action(async (runId?: string) => {
    await handlers.githubActions(runId);
  });
  const githubCiCommand = githubCommand.command('ci').description('inspect GitHub CI failures');
  githubCiCommand.command('explain').argument('[runId]', 'GitHub Actions run id').description('explain failed checks for a run or latest failing run').action(async (runId?: string) => {
    await handlers.githubCiExplain(runId);
  });
  const githubAutomateCommand = githubCommand.command('automate').description('dry-run-safe GitHub automation workflows');
  githubAutomateCommand.command('issue').argument('<numberOrUrl>').option('--dry-run', 'preview without writes', true).action(async (target: string, options: {dryRun?: boolean}) => {
    await handlers.githubAutomateIssue?.(target, options);
  });
  githubAutomateCommand.command('pr-review').argument('<numberOrUrl>').option('--dry-run', 'preview without writes', true).action(async (target: string, options: {dryRun?: boolean}) => {
    await handlers.githubAutomatePrReview?.(target, options);
  });
  githubAutomateCommand.command('fix-ci').argument('<numberUrlOrRef>').option('--dry-run', 'preview without writes', true).action(async (target: string, options: {dryRun?: boolean}) => {
    await handlers.githubAutomateFixCi?.(target, options);
  });
  githubCommand.command('parse-command').argument('<comment>').description('parse an @apeironcode mention command').action(async (comment: string) => {
    await handlers.githubParseCommand?.(comment);
  });
  githubCommand.command('action').description('GitHub Action helpers').command('simulate').argument('<eventJson>').action(async (eventJson: string) => {
    await handlers.githubActionSimulate?.(eventJson);
  });

  const securityCommand = program.command('security').description('show explicit local security limits');
  securityCommand.command('status').description('show security status and limits').action(async () => {
    await handlers.securityStatus();
  });
  securityCommand.command('limits').description('show security limits').action(async () => {
    await handlers.securityStatus();
  });

  const sandboxCommand = program.command('sandbox').description('inspect optional command sandbox backends');
  sandboxCommand.command('status').description('show sandbox status').action(async () => {
    await handlers.sandboxStatus();
  });
  sandboxCommand.command('doctor').description('show sandbox diagnostics').action(async () => {
    await handlers.sandboxDoctor();
  });

  const workflowCommand = program.command('workflow').description('run code quality workflows');
  workflowCommand.command('list').description('list workflows').action(async () => {
    await handlers.workflowList();
  });
  workflowCommand.command('show').argument('<name>', 'workflow name').description('show typed workflow recipe').action(async (name: string) => {
    await handlers.workflowShow(name);
  });
  workflowCommand.command('run').argument('<name>', 'workflow name').argument('[task]', 'task').option('--dry-run', 'show recipe stages without running the agent').description('run a workflow through the agent runtime').action(async (name: string, task: string | undefined, options: {dryRun?: boolean}) => {
    await handlers.workflowRun(name, {dryRun: options.dryRun, task});
  });
  workflowCommand.command('report').argument('<runId>', 'workflow run id').description('show workflow report').action(async (runId: string) => {
    await handlers.workflowReport(runId);
  });

  const evalCommand = program.command('eval').description('run local smoke evaluations with mock providers');
  evalCommand.command('list').description('list available evaluations').action(async () => {
    await handlers.evalList();
  });
  evalCommand.command('run').argument('[suite]', 'evaluation suite').option('--all', 'run every built-in suite').description('run an evaluation suite').action(async (suite: string | undefined, options: {all?: boolean}) => {
    await handlers.evalRun(suite, options);
  });
  evalCommand.command('result').argument('[suite]', 'evaluation suite').description('show the latest evaluation result').action(async (suite?: string) => {
    await handlers.evalReport(suite);
  });
  evalCommand.command('report').argument('[suite]', 'evaluation suite').description('show the latest evaluation report').action(async (suite?: string) => {
    await handlers.evalReport(suite);
  });

  const connectorCommand = program.command('connector').description('inspect connector configuration without network calls');
  connectorCommand.command('list').description('list connector readiness').action(async () => {
    await handlers.connectorList();
  });
  connectorCommand.command('env').argument('<connector>', 'github | linear | jira | slack').description('show connector env requirements').action(async (connector: string) => {
    await handlers.connectorEnv(connector);
  });

  // Markdown extensibility: project-defined agents, skills, commands
  const mdAgentCommand = program.command('mdag').description('inspect Markdown-defined project agents (.apeironcode/agents/)');
  mdAgentCommand.command('list').description('list project Markdown agents').action(async () => {
    await handlers.markdownAgentList?.();
  });
  mdAgentCommand.command('show').argument('<name>', 'agent name').description('show a project Markdown agent').action(async (name: string) => {
    await handlers.markdownAgentShow?.(name);
  });

  const mdSkillCommand = program.command('mdskill').description('inspect Markdown-defined project skills (.apeironcode/skills/)');
  mdSkillCommand.command('list').description('list project Markdown skills').action(async () => {
    await handlers.markdownSkillList?.();
  });
  mdSkillCommand.command('show').argument('<name>', 'skill name').description('show a project Markdown skill').action(async (name: string) => {
    await handlers.markdownSkillShow?.(name);
  });

  const mdCommandCommand = program.command('mdcommand').description('run Markdown-defined project commands (.apeironcode/commands/)');
  mdCommandCommand.command('list').description('list project Markdown commands').action(async () => {
    await handlers.markdownCommandList?.();
  });
  mdCommandCommand.command('show').argument('<name>', 'command name or alias').description('show a project Markdown command').action(async (name: string) => {
    await handlers.markdownCommandShow?.(name);
  });
  mdCommandCommand.command('run').argument('<name>', 'command name or alias').argument('[args...]', 'arguments passed as {{args}}').description('render and display a project Markdown command prompt').action(async (name: string, args: string[]) => {
    await handlers.markdownCommandRun?.(name, args.join(' '));
  });

  // Phase 16D: Background task commands
  const bgTaskCommand = program.command('task').description('create and manage local background tasks');
  bgTaskCommand.command('create').argument('<prompt>', 'task prompt or goal').option('--kind <kind>', 'task kind: agent|shell|review|test-fix|workflow', 'agent').option('--worktree', 'run task in isolated git worktree').option('--agent <name>', 'markdown agent name').option('--skill <name>', 'skill names (repeatable)', (v: string, a: string[]) => [...a, v], [] as string[]).option('--command <name>', 'markdown command name').option('--start', 'start task immediately after creating').description('create a background task').action(async (prompt: string, options: {kind?: string; worktree?: boolean; agent?: string; skill?: string[]; command?: string; start?: boolean}) => {
    await handlers.bgTaskCreate?.(prompt, options);
  });
  bgTaskCommand.command('list').option('--status <status>', 'filter by status').option('--kind <kind>', 'filter by kind').description('list background tasks').action(async (options: {status?: string; kind?: string}) => {
    await handlers.bgTaskList?.(options);
  });
  bgTaskCommand.command('show').argument('<taskId>', 'task id (or prefix)').description('show task details').action(async (taskId: string) => {
    await handlers.bgTaskShow?.(taskId);
  });
  bgTaskCommand.command('output').argument('<taskId>', 'task id').description('show task output and logs').action(async (taskId: string) => {
    await handlers.bgTaskOutput?.(taskId);
  });
  bgTaskCommand.command('stop').argument('<taskId>', 'task id').description('stop a running or queued task').action(async (taskId: string) => {
    await handlers.bgTaskStop?.(taskId);
  });
  bgTaskCommand.command('resume').argument('<taskId>', 'task id').description('resume a paused or stopped task').action(async (taskId: string) => {
    await handlers.bgTaskResume?.(taskId);
  });

  // Phase 16E: Bridge commands
  const bridgeCommand = program.command('bridge').description('ApeironCode IDE Bridge Protocol (local-only)');
  bridgeCommand
    .command('start')
    .description('start the local bridge server (protocol layer for IDE integrations)')
    .option('--port <port>', 'local port (default: auto)', parseInt)
    .action(async (options: {port?: number}) => { await handlers.bridgeStart?.(options); });
  bridgeCommand
    .command('status')
    .description('show bridge server status')
    .action(async () => { await handlers.bridgeStatus?.(); });
  bridgeCommand
    .command('token')
    .description('show bridge auth token fingerprint (use --show to reveal full token)')
    .option('--show', 'reveal the full token (use with caution)')
    .action(async (options: {show?: boolean}) => { await handlers.bridgeToken?.(options); });
  bridgeCommand
    .command('stop')
    .description('stop the local bridge server')
    .action(async () => { await handlers.bridgeStop?.(); });

  // Phase 16D: Worktree commands
  const wtCommand = program.command('worktree').description('manage ApeironCode agent worktrees');
  wtCommand.command('list').description('list known agent worktrees').action(async () => {
    await handlers.worktreeList?.();
  });
  wtCommand.command('show').argument('<id>', 'worktree id').description('show worktree details').action(async (id: string) => {
    await handlers.worktreeShow?.(id);
  });
  wtCommand.command('remove').argument('<id>', 'worktree id').option('--yes', 'confirm removal').description('remove a worktree and its branch').action(async (id: string, options: {yes?: boolean}) => {
    await handlers.worktreeRemove?.(id, options);
  });

};
