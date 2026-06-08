import {Command} from 'commander';

import {AGENT_MODES, type AgentMode} from '../agent/types.js';

import type {
  CostCliOptions,
  ConfigCommandKey,
  ConfigSetOptions,
  DoctorCliOptions,
  HistoryCliOptions,
  RevertCliOptions,
  RootCliOptions,
  SearchCliOptions,
  SessionCliOptions,
} from './args.js';

import type {CliHandlers} from './commands/types.js';
export type {CliHandlers} from './commands/types.js';
import {registerMemoryAndSkillCommands} from './commands/memorySkills.js';
import {registerAdvancedCommands} from './commands/advanced.js';
import {registerContextAndRepoCommands} from './commands/contextRepoCommands.js';
import {registerProviderWebCommands} from './commands/providerWeb.js';
import {registerRuntimeCommands} from './commands/runtimeCommands.js';

export const collectOptions = <T extends object>(options: T, command?: Command): T => {
  return {
    ...(typeof command?.optsWithGlobals === 'function' ? command.optsWithGlobals() : {}),
    ...(typeof command?.opts === 'function' ? command.opts() : {}),
    ...options,
  };
};

export const buildProgram = (handlers: CliHandlers): Command => {
  const program = new Command();

  program
    .name('apeironcode')
    .description(
      'ApeironCode is an open-source, local-first AI coding assistant for local and cloud models.',
    )
    .argument('[prompt]', 'run in one-shot mode with the provided prompt')
    .option('--provider <provider>', 'override the configured provider for this run')
    .option('--model <model>', 'override the configured model for this run')
    .option('--mode <mode>', `run in a specific mode: ${AGENT_MODES.join(', ')}`)
    .option('--approval-mode <mode>', 'override approval mode for this run')
    .option('--resume <sessionId>', 'resume an existing session in one-shot or interactive mode')
    .option('--plan', 'create a plan, request approval, then execute if approved')
    .option('--plan-only', 'create a plan and show it without executing')
    .option('--execute-plan <planId>', 'execute an already-approved plan by id')
    .option('--welcome', 'show the ApeironCode welcome dashboard before interactive start')
    .option(
      '--dangerously-skip-approvals',
      'disable approvals for this run; intended only for trusted automation',
      false,
    )
    .action(async (prompt: string | undefined, options: RootCliOptions, command: Command) => {
      await handlers.runRoot(prompt, collectOptions(options, command));
    });

  const configCommand = program.command('config').description('inspect or update local configuration');

  configCommand
    .command('list')
    .description('show the persisted user configuration')
    .action(async () => {
      await handlers.listConfig();
    });

  configCommand
    .command('get')
    .description('get a single configuration value')
    .argument('<key>', 'provider | model | baseUrl | approvalMode | theme | localOnly | telemetry | maxContextFiles | maxFileSize')
    .option('--provider <provider>', 'provider name for provider-specific settings like baseUrl')
    .action(async (key: ConfigCommandKey, options: ConfigSetOptions, command: Command) => {
      await handlers.getConfigValue(key, collectOptions(options, command));
    });

  configCommand
    .command('set')
    .description('set a user configuration value')
    .argument('<key>', 'provider | model | baseUrl | approvalMode | theme | localOnly | telemetry | maxContextFiles | maxFileSize')
    .argument('<value>', 'new value')
    .option('--provider <provider>', 'provider name for provider-specific settings like baseUrl')
    .action(async (key: ConfigCommandKey, value: string, options: ConfigSetOptions, command: Command) => {
      await handlers.setConfigValue(key, value, collectOptions(options, command));
    });

  const setupCommand = program
    .command('setup')
    .description('configure a usable first-run provider profile')
    .option('--local', 'configure local Ollama defaults')
    .option('--provider <provider>', 'mock | ollama | openrouter | gemini | openaiCompatible')
    .action(async (options: {local?: boolean; provider?: string}, command: Command) => {
      await handlers.setup(collectOptions(options, command));
    });

  setupCommand.command('status').description('show setup state').action(async () => {
    await handlers.setupStatus();
  });
  setupCommand.command('reset').description('remove user setup config').option('--dry-run', 'show what would be removed').action(async (options: {dryRun?: boolean}) => {
    await handlers.setupReset(options);
  });

  program
    .command('doctor')
    .description('run environment and provider diagnostics')
    .option('--fix', 'apply safe diagnostics fixes')
    .option('--report', 'print a redacted markdown system report')
    .option('--provider-check', 'also run a provider connectivity smoke test when safe')
    .option('--strict', 'treat skipped or weak provider smoke results as failures when testing connectivity')
    .action(async (options: DoctorCliOptions, command: Command) => {
      await handlers.doctor(collectOptions(options, command));
    });

  program
    .command('cost')
    .description('show token and cost usage for the latest session, this project, all projects, or a specific session')
    .option('--project', 'show aggregated usage for saved sessions in this project')
    .option('--all', 'show aggregated usage for saved sessions across all projects')
    .option('--session <sessionId>', 'show usage for a specific saved session')
    .action(async (options: CostCliOptions, command: Command) => {
      await handlers.cost(collectOptions(options, command));
    });

  program
    .command('history')
    .description('browse recent sessions, usage, and edit history for this project')
    .option('--all', 'include sessions from all projects in the session and cost sections')
    .option('--file <path>', 'filter edit history to a file path in this project')
    .option('--session <sessionId>', 'filter session and edit history to a specific saved session')
    .option('--limit <count>', 'limit each history section to the most recent count', (value: string) => Number.parseInt(value, 10))
    .action(async (options: HistoryCliOptions, command: Command) => {
      await handlers.history(collectOptions(options, command));
    });

  program
    .command('search')
    .description('search saved sessions, task plans, edit history, and memory')
    .argument('<query>', 'search query')
    .option('--all', 'include saved sessions from all projects')
    .option('--scope <scope>', 'all | session | task | edit | memory')
    .option('--limit <count>', 'limit the number of results', (value: string) => Number.parseInt(value, 10))
    .action(async (query: string, options: SearchCliOptions, command: Command) => {
      await handlers.search(query, collectOptions(options, command));
    });

  program
    .command('continue')
    .description('continue a task plan by id, or the latest incomplete task plan for this project')
    .argument('[taskId]', 'task id to continue')
    .action(async (taskId?: string) => {
      await handlers.continueTask(taskId);
    });

  const brainCommand = program.command('brain').description('preview and manage optional per-project Project Brain files');

  brainCommand.command('plan').description('preview .apeironcode Project Brain creation without writing files').action(async () => {
    await handlers.brainPlan?.();
  });
  brainCommand.command('init').description('initialize .apeironcode Project Brain files; requires --yes').option('--yes', 'approve creating Project Brain files').option('--dry-run', 'show result without writing').action(async (options: {dryRun?: boolean; yes?: boolean}) => {
    await handlers.brainInit?.(options);
  });
  brainCommand.command('status').description('show Project Brain health').action(async () => {
    await handlers.brainStatus?.();
  });
  brainCommand.command('show').description('show a safe Project Brain summary').action(async () => {
    await handlers.brainShow?.();
  });
  brainCommand.command('update').description('append a Project Brain run summary; requires --yes').option('--yes', 'approve updating Project Brain files').option('--summary <summary>', 'short run summary to append').action(async (options: {summary?: string; yes?: boolean}) => {
    await handlers.brainUpdate?.(options);
  });
  brainCommand.command('tasks').description('show Project Brain task summary').action(async () => {
    await handlers.brainTasks?.();
  });
  brainCommand.command('memory').description('show Project Brain memory summary').action(async () => {
    await handlers.brainMemory?.();
  });
  brainCommand.command('audit').description('audit Project Brain features and wiring').action(async () => {
    await handlers.brainAudit?.();
  });
  brainCommand.command('sync-preview').description('preview pending Project Brain sync without writing').action(async () => {
    await handlers.brainSyncPreview?.();
  });
  brainCommand.command('sync').description('apply approved Project Brain sync; requires --yes').option('--yes', 'approve applying sync').action(async (options: {yes?: boolean}) => {
    await handlers.brainSync?.(options);
  });
  brainCommand.command('build-plan').description('create a multi-phase plan from a large app-build prompt (no files written)').argument('<prompt>', 'app build prompt').action(async (prompt: string) => {
    await handlers.brainBuildPlan?.(prompt);
  });
  brainCommand.command('route').description('show which agents and skills would be selected for a prompt').argument('<prompt>', 'prompt to route').action(async (prompt: string) => {
    await handlers.brainRoute?.(prompt);
  });
  brainCommand.command('context').description('show what Project Brain context would be injected for a prompt').argument('<prompt>', 'prompt to analyze').action(async (prompt: string) => {
    await handlers.brainContext?.(prompt);
  });
  brainCommand.command('previews').description('list saved Project Brain sync previews').action(async () => {
    await handlers.brainPreviews?.();
  });
  brainCommand.command('orchestrate').description('create a large app build orchestration plan (no files written)').argument('<prompt>', 'app build prompt').action(async (prompt: string) => {
    await handlers.brainOrchestrate?.(prompt);
  });
  brainCommand.command('runtime').description('show what intent and context would be selected for a prompt at runtime').argument('<prompt>', 'prompt to analyze').action(async (prompt: string) => {
    await handlers.brainRuntime?.(prompt);
  });
  brainCommand.command('explain').description('explain in detail how brain context would be selected for a prompt').argument('<prompt>', 'prompt to explain').action(async (prompt: string) => {
    await handlers.brainExplain?.(prompt);
  });

  const brainPreviewCommand = brainCommand.command('preview').description('manage saved Project Brain sync previews');
  brainPreviewCommand.command('show').description('show a saved sync preview by id').argument('<id>', 'preview id').action(async (id: string) => {
    await handlers.brainPreviewShow?.(id);
  });
  brainPreviewCommand.command('apply').description('apply a saved sync preview; requires --yes').argument('<id>', 'preview id').option('--yes', 'approve applying preview').action(async (id: string, options: {yes?: boolean}) => {
    await handlers.brainPreviewApply?.(id, options);
  });

  const planCommand = program.command('plan').description('inspect persistent task plans for this project');

  planCommand
    .command('show')
    .description('show a task plan by id, or the latest incomplete task plan when omitted')
    .argument('[taskId]', 'task id')
    .action(async (taskId?: string) => {
      await handlers.planShow(taskId);
    });

  planCommand
    .command('list')
    .description('list persisted task plans for this project')
    .action(async () => {
      await handlers.planList();
    });

  planCommand
    .command('status')
    .description('show the status of a task plan by id, or the latest incomplete task plan')
    .argument('[taskId]', 'task id')
    .action(async (taskId?: string) => {
      await handlers.planStatus(taskId);
    });

  planCommand
    .command('pause')
    .description('pause a persisted task plan')
    .argument('<taskId>', 'task id')
    .action(async (taskId: string) => {
      await handlers.planPause(taskId);
    });

  planCommand
    .command('resume')
    .description('mark a paused, pending, or failed task plan as running')
    .argument('<taskId>', 'task id')
    .action(async (taskId: string) => {
      await handlers.planResume(taskId);
    });

  planCommand
    .command('delete')
    .description('delete a persisted task plan by id')
    .argument('<taskId>', 'task id')
    .action(async (taskId: string) => {
      await handlers.planDelete(taskId);
    });

  planCommand
    .command('clear')
    .description('clear all persisted task plans for this project')
    .action(async () => {
      await handlers.planClear();
    });

  planCommand
    .command('create')
    .description('create and show a new execution plan for a goal')
    .argument('<goal>', 'the goal to plan for')
    .action(async (goal: string) => {
      await handlers.planCreate(goal);
    });

  planCommand
    .command('approve')
    .description('approve a draft execution plan to proceed with execution')
    .argument('<planId>', 'the plan id to approve')
    .action(async (planId: string) => {
      await handlers.planApprove(planId);
    });

  planCommand
    .command('execute')
    .description('execute an already-approved execution plan by id')
    .argument('<planId>', 'the plan id to execute')
    .action(async (planId: string) => {
      await handlers.planExecute(planId);
    });

  planCommand
    .command('revise')
    .description('update a draft plan and reset its approval status')
    .argument('<planId>', 'the plan id to revise')
    .argument('<instructions>', 'revision instructions')
    .action(async (planId: string, instructions: string) => {
      await handlers.planRevise(planId, instructions);
    });

  program
    .command('revert')
    .description('revert the last edit, a specific edit id, or the latest edit for a file')
    .argument('[target]', 'edit id or the literal "last"')
    .option('--file <path>', 'revert the latest edit for a file path')
    .action(async (target: string | undefined, options: RevertCliOptions, command: Command) => {
      await handlers.revert(target, collectOptions(options, command));
    });

  registerProviderWebCommands(program, handlers);

  const sessionsCommand = program.command('sessions').description('manage saved local sessions');
  const sessionCommand = program.command('session').description('(Phase 7) multi-agent session management');
  const permissionsCommand = program.command('permissions').description('manage permission rules');

  sessionsCommand
    .command('list')
    .description('list local sessions for this project by default')
    .option('--all', 'list sessions for all projects')
    .action(async (options: SessionCliOptions, command: Command) => {
      await handlers.listSessions(collectOptions(options, command));
    });

  sessionsCommand
    .command('resume')
    .description('resume a saved session by id')
    .argument('<sessionId>', 'session id')
    .action(async (sessionId: string) => {
      await handlers.resumeSession(sessionId);
    });

  sessionsCommand
    .command('delete')
    .description('delete a saved session by id')
    .argument('<sessionId>', 'session id')
    .action(async (sessionId: string) => {
      await handlers.deleteSession(sessionId);
    });

  // Phase 7: Multi-agent session commands
  sessionCommand
    .command('start <goal>')
    .description('create a new agent session')
    .option('--mode <mode>', 'agent mode: chat, debug, fix, feature, review, refactor, test-fix, explain, commit, pr')
    .option('--provider <name>', 'provider name')
    .option('--model <name>', 'model name')
    .option('--background', '(planned) run session in background')
    .option('--no-run', 'create the session without running it')
    .action(async (goal: string, options: {mode?: string; provider?: string; model?: string; background?: boolean; run?: boolean}) => {
      await handlers.sessionStart(goal, {
        mode: options.mode as AgentMode | undefined,
        provider: options.provider,
        model: options.model,
        background: options.background,
        run: options.run,
      });
    });

  sessionCommand
    .command('export <sessionId>')
    .description('export a session as json, markdown, or html')
    .option('--format <format>', 'json | markdown | html', 'markdown')
    .option('--output <file>', 'write to a specific output file')
    .action(async (sessionId: string, options: {format?: string; output?: string}) => {
      await handlers.sessionExport(sessionId, {
        format: options.format as 'html' | 'json' | 'markdown' | undefined,
        output: options.output,
      });
    });

  const debugCommand = program.command('debug').description('safe local debugging snapshots');
  debugCommand.command('traces').option('--last <count>', 'number of spans', '10').action(async (options: {last?: string}) => {
    await handlers.debugTraces({last: Number.parseInt(options.last ?? '10', 10)});
  });
  debugCommand.command('logs').option('--last <count>', 'number of log lines', '50').action(async (options: {last?: string}) => {
    await handlers.debugLogs({last: Number.parseInt(options.last ?? '50', 10)});
  });
  debugCommand.command('tokens').action(async () => {
    await handlers.debugTokens();
  });
  debugCommand.command('config').description('print redacted effective config').action(async () => {
    await handlers.debugConfig();
  });
  debugCommand
    .command('compression')
    .description('explain how context compaction would summarize/preserve items')
    .action(async () => {
      await handlers.debugCompression?.();
    });

  sessionCommand
    .command('list')
    .description('list sessions in current project')
    .option('--all', 'list all sessions across projects')
    .action(async (options: {all?: boolean}) => {
      await handlers.sessionList(options);
    });

  sessionCommand
    .command('show <sessionId>')
    .description('show session details and metadata')
    .action(async (sessionId: string) => {
      await handlers.sessionShow(sessionId);
    });

  sessionCommand
    .command('logs <sessionId>')
    .description('show event log for a session')
    .option('--tail <count>', 'show last N events (default 50)', '50')
    .option('--follow', 'follow new events (experimental)')
    .action(async (sessionId: string, options: {tail: string; follow?: boolean}) => {
      await handlers.sessionLogs(sessionId, {
        tail: parseInt(options.tail, 10),
        follow: options.follow,
      });
    });

  sessionCommand
    .command('attach <sessionId>')
    .description('attach to a session and view recent events')
    .action(async (sessionId: string) => {
      await handlers.sessionAttach(sessionId);
    });

  sessionCommand
    .command('stop <sessionId>')
    .description('stop a running session')
    .action(async (sessionId: string) => {
      await handlers.sessionStop(sessionId);
    });

  sessionCommand
    .command('run-worker <sessionId>')
    .description('(internal) run worker process for session')
    .action(async (sessionId: string) => {
      await handlers.sessionRunWorker(sessionId);
    });

  program
    .command('share')
    .description('export a session to a shareable format')
    .argument('[sessionId]', 'session id or "latest"')
    .option('--format <format>', 'export format: json, markdown, or html')
    .action(async (sessionId: string | undefined, options: {format?: string}) => {
      const id = sessionId ?? 'latest';
      await handlers.share(id, {format: options.format as 'json' | 'markdown' | 'html' | undefined});
    });

  permissionsCommand
    .command('list')
    .description('list configured permission rules')
    .action(async () => {
      await handlers.listPermissions();
    });

  permissionsCommand
    .command('add')
    .description('add a permission rule like Bash(npm test)')
    .argument('<rule>', 'permission rule')
    .action(async (rule: string) => {
      await handlers.addPermission(rule);
    });

  permissionsCommand
    .command('remove')
    .description('remove a previously added permission rule')
    .argument('<rule>', 'permission rule')
    .action(async (rule: string) => {
      await handlers.removePermission(rule);
    });

  permissionsCommand
    .command('check')
    .description('check if a resource is allowed, denied, or needs approval')
    .argument('<resource>', 'resource to check (e.g., "Bash(npm test)" or "Tool(plugin:echo.echo)")')
    .action(async (resource: string) => {
      await handlers.checkPermission(resource);
    });

  const pluginsCommand = program.command('plugins').description('manage plugins');

  pluginsCommand
    .command('list')
    .description('list all loaded plugins and their tools')
    .action(async () => {
      await handlers.listPlugins();
    });

  const mcpCommand = program.command('mcp').description('manage MCP servers');

  const mcpAddCommand = mcpCommand.command('add').description('add an MCP server');
  mcpAddCommand.command('stdio').argument('<id>', 'server id').requiredOption('--command <command>', 'command to spawn').option('--args <args...>', 'command arguments').action(async (id: string, options: {args?: string[]; command: string}) => {
    await handlers.mcpAddStdio?.(id, options);
  });
  mcpAddCommand.command('http').argument('<id>', 'server id').requiredOption('--url <url>', 'JSON-RPC HTTP endpoint').action(async (id: string, options: {url: string}) => {
    await handlers.mcpAddHttp?.(id, options);
  });
  mcpAddCommand.command('sse').argument('<id>', 'server id').requiredOption('--url <url>', 'SSE endpoint').action(async (id: string, options: {url: string}) => {
    await handlers.mcpAddSse?.(id, options);
  });

  mcpCommand.command('remove').argument('<server>', 'server id').action(async (serverName: string) => {
    await handlers.mcpRemove?.(serverName);
  });
  mcpCommand.command('enable').argument('<server>', 'server id').action(async (serverName: string) => {
    await handlers.mcpEnable?.(serverName);
  });
  mcpCommand.command('disable').argument('<server>', 'server id').action(async (serverName: string) => {
    await handlers.mcpDisable?.(serverName);
  });

  mcpCommand.command('list').description('list configured MCP servers').action(async () => {
    await handlers.listMcp();
  });

  mcpCommand.command('tools').description('list tools exposed by a configured MCP server').argument('[server]', 'configured server name').option('--all', 'list tools from every configured MCP server').action(async (serverName: string | undefined, options: {all?: boolean}) => {
    await handlers.listMcpTools(serverName ?? '', options);
  });
  mcpCommand.command('search').argument('<query>', 'search MCP tool names and descriptions').action(async (query: string) => {
    await handlers.mcpSearch?.(query);
  });

  mcpCommand.command('call').description('call an MCP tool through the configured server').argument('<server>', 'configured server name').argument('<tool>', 'tool name').option('--json <json>', 'JSON input object', '{}').action(async (serverName: string, toolName: string, options: {json?: string}) => {
    await handlers.mcpCall?.(serverName, toolName, options);
  });

  mcpCommand.command('resources').argument('<server>', 'server id').action(async (serverName: string) => {
    await handlers.mcpResources?.(serverName);
  });
  mcpCommand.command('read').argument('<server>', 'server id').argument('<uri>', 'resource URI').option('--add-to-context', 'stage resource for explicit context use').action(async (serverName: string, uri: string, options: {addToContext?: boolean}) => {
    await handlers.mcpRead?.(serverName, uri, options);
  });
  mcpCommand.command('prompts').argument('<server>', 'server id').action(async (serverName: string) => {
    await handlers.mcpPrompts?.(serverName);
  });
  mcpCommand.command('prompt').argument('<server>', 'server id').argument('<name>', 'prompt name').option('--preview', 'preview prompt messages without injecting').action(async (serverName: string, promptName: string, options: {preview?: boolean}) => {
    await handlers.mcpPrompt?.(serverName, promptName, options);
  });
  mcpCommand.command('permissions').argument('<server>', 'server id').action(async (serverName: string) => {
    await handlers.mcpPermissions?.(serverName);
  });
  mcpCommand.command('allow').argument('<server>', 'server id').argument('<tool>', 'tool name').action(async (serverName: string, toolName: string) => {
    await handlers.mcpAllow?.(serverName, toolName);
  });
  mcpCommand.command('deny').argument('<server>', 'server id').argument('<tool>', 'tool name').action(async (serverName: string, toolName: string) => {
    await handlers.mcpDeny?.(serverName, toolName);
  });
  const mcpAuthCommand = mcpCommand.command('auth').description('manage MCP OAuth tokens');
  mcpAuthCommand.command('login').argument('<server>', 'server id').action(async (serverName: string) => {
    await handlers.mcpAuthLogin?.(serverName);
  });
  mcpAuthCommand.command('status').argument('<server>', 'server id').action(async (serverName: string) => {
    await handlers.mcpAuthStatus?.(serverName);
  });
  mcpAuthCommand.command('logout').argument('<server>', 'server id').action(async (serverName: string) => {
    await handlers.mcpAuthLogout?.(serverName);
  });

  mcpCommand.command('test').description('test connectivity to a configured MCP server').argument('<server>', 'configured server name').action(async (serverName: string) => {
    await handlers.testMcp(serverName);
  });

  program
    .command('tools')
    .description('list all available tools (built-in, plugin, and MCP)')
    .action(async () => {
      await handlers.listTools();
    });

  registerContextAndRepoCommands(program, handlers);

  registerMemoryAndSkillCommands(program, handlers);
  registerAdvancedCommands(program, handlers);
  registerRuntimeCommands(program, handlers);

  return program;
};
