import type {SlashCommandDefinition} from './shared.js';
import {
  appendSlashMessage,
  filterSlashCommandCatalog,
  findSlashCommandDefinition,
  formatSlashCommandCatalog,
  formatSlashCommandDetails,
} from './format.js';
import {getSlashDefinitions} from './shared.js';
import {formatDoctorReport, runDoctor} from '../../diagnostics/doctor.js';
import {formatMcpEndpointList, formatMcpTestResult, formatMcpToolList} from '../../mcp/display.js';
import {findConfiguredMcpEndpoint, listConfiguredMcpEndpoints} from '../../mcp/endpoints.js';
import {sharedMcpServerManager} from '../../mcp/manager.js';
import {loadPluginCatalog} from '../../plugins/loader.js';
import {formatPluginCatalog} from '../../plugins/mcp.js';
import {formatToolList, loadExternalTools} from '../../tools/external.js';

export const createSystemCommands = (): SlashCommandDefinition[] => [
{
    description: 'Show available slash commands or detailed help for one command',
    examples: ['/help fix', '/help provider'],
    name: '/help',
    usage: '/help [command]',
    run(args, context) {
      const definitions = getSlashDefinitions();
      const requestedCommand = args.join(' ').trim();
      if (!requestedCommand) {
        appendSlashMessage(context, formatSlashCommandCatalog(definitions));
        return;
      }

      const categoryQueries = new Set(['advanced', 'agent', 'beginner', 'github', 'hooks', 'lsp', 'memory', 'provider', 'security', 'session', 'sessions', 'setup', 'share', 'skill', 'skills', 'start', 'team', 'workflow']);
      if (categoryQueries.has(requestedCommand.toLowerCase())) {
        appendSlashMessage(context, formatSlashCommandCatalog(definitions, requestedCommand));
        return;
      }

      const filtered = filterSlashCommandCatalog(definitions, requestedCommand);
      const definition = categoryQueries.has(requestedCommand.toLowerCase())
        ? undefined
        : findSlashCommandDefinition(definitions, requestedCommand);
      appendSlashMessage(
        context,
        definition
          ? formatSlashCommandDetails(definition)
          : filtered.length > 0
            ? formatSlashCommandCatalog(filtered, requestedCommand)
            : `Unknown command: ${requestedCommand}`,
      );
    },
  },
{
    description: 'Alias for /help with the same command catalog and examples',
    examples: ['/commands', '/commands review'],
    name: '/commands',
    usage: '/commands [command]',
    run(args, context) {
      const definitions = getSlashDefinitions();
      const requestedCommand = args.join(' ').trim();
      if (!requestedCommand) {
        appendSlashMessage(context, formatSlashCommandCatalog(definitions));
        return;
      }

      const categoryQueries = new Set(['advanced', 'agent', 'beginner', 'github', 'hooks', 'lsp', 'memory', 'provider', 'security', 'session', 'sessions', 'setup', 'share', 'skill', 'skills', 'start', 'team', 'workflow']);
      if (categoryQueries.has(requestedCommand.toLowerCase())) {
        appendSlashMessage(context, formatSlashCommandCatalog(definitions, requestedCommand));
        return;
      }

      const filtered = filterSlashCommandCatalog(definitions, requestedCommand);
      const definition = categoryQueries.has(requestedCommand.toLowerCase())
        ? undefined
        : findSlashCommandDefinition(definitions, requestedCommand);
      appendSlashMessage(
        context,
        definition
          ? formatSlashCommandDetails(definition)
          : filtered.length > 0
            ? formatSlashCommandCatalog(filtered, requestedCommand)
            : `Unknown command: ${requestedCommand}`,
      );
    },
  },
{
    category: 'Start',
    description: 'Return to the workspace dashboard',
    examples: ['/dashboard'],
    name: '/dashboard',
    status: 'stable',
    usage: '/dashboard',
    run(_args, context) {
      context.setDashboard(null);
      context.expandHome?.();
      context.appendLocalAssistantMessage('Workspace dashboard expanded. Type a prompt to return to the compact home.');
      context.refreshSessionState();
    },
  },
{
    category: 'Start',
    description: 'Show a beginner-friendly starting point',
    examples: ['/start'],
    name: '/start',
    status: 'stable',
    usage: '/start',
    run(_args, context) {
      context.appendLocalAssistantMessage([
        'Start here',
        '',
        '1. /setup — choose mock, Ollama, or an API provider',
        '2. /explain repo — understand the current project',
        '3. /fix tests — investigate failing tests',
        '4. /review diff — review local changes',
        '5. /commands beginner — see the short command palette',
      ].join('\n'));
    },
  },
{
    category: 'Setup',
    description: 'Configure a usable provider profile without storing secrets',
    examples: ['/setup', '/setup mock', '/setup ollama', '/setup openrouter', '/setup status'],
    name: '/setup',
    status: 'stable',
    usage: '/setup [mock|ollama|openrouter|gemini|openaiCompatible|status]',
    async run(args, context) {
      const {applySetupProfile, formatSetupResult, formatSetupStatus, getSetupStatus} = await import('../../setup/setup.js');
      const provider = args[0];
      if (provider === 'status') {
        context.appendLocalAssistantMessage(formatSetupStatus(await getSetupStatus(context.configStore)));
        return;
      }
      context.appendLocalAssistantMessage(formatSetupResult(await applySetupProfile(context.configStore, {provider})));
      await context.refreshConfig();
      context.refreshSessionState();
    },
  },
{
    description: 'Show the active config summary',
    name: '/config',
    usage: '/config',
    run(_args, context) {
      const resolvedConfig = context.getResolvedConfig();
      context.appendLocalAssistantMessage(
        JSON.stringify(
          {
            approvalMode: resolvedConfig.effective.approvalMode,
            defaultModel: resolvedConfig.effective.defaultModel,
            defaultProvider: resolvedConfig.effective.defaultProvider,
            fallbackModel: resolvedConfig.effective.fallbackModel ?? null,
            modelRoles: resolvedConfig.effective.models,
            plugins: resolvedConfig.effective.plugins,
          },
          null,
          2,
        ),
      );
    },
  },
{
    description: 'Run diagnostics including provider readiness',
    name: '/doctor',
    usage: '/doctor [strict]',
    async run(args, context) {
      const strict = args.includes('strict') || args.includes('--strict');
      const resolvedConfig = context.getResolvedConfig();
      const report = await runDoctor({
        config: resolvedConfig,
        cwd: context.cwd,
        providerRegistry: context.providerRegistry,
        strictProviderConnectivity: strict,
        testProviderConnectivity: true,
      });
      context.appendLocalAssistantMessage(formatDoctorReport(report));
    },
  },
{
    description: 'List plugin manifests and MCP endpoints',
    name: '/plugins',
    usage: '/plugins [name]',
    async run(args, context) {
      const query = args.join(' ').trim();
      const resolvedConfig = context.getResolvedConfig();
      const plugins = await loadPluginCatalog({config: resolvedConfig.effective, cwd: context.cwd});
      if (!query) {
        const mcpEndpoints = listConfiguredMcpEndpoints({config: resolvedConfig.effective, plugins});
        context.appendLocalAssistantMessage(
          [formatPluginCatalog(plugins), '', `MCP endpoints: ${mcpEndpoints.length}`].join('\n'),
        );
        return;
      }

      const plugin = plugins.find((candidate) => candidate.manifest.name === query);
      if (!plugin) {
        context.appendLocalAssistantMessage(`Plugin ${query} not found.`);
        return;
      }

      context.appendLocalAssistantMessage(JSON.stringify(plugin, null, 2));
    },
  },
{
    description: 'Inspect or edit permission rules',
    name: '/permissions',
    usage: '/permissions list|add|remove|reset [rule]',
    async run(args, context) {
      const [action, ...rest] = args;
      const rule = rest.join(' ').trim();
      const currentConfig = await context.configStore.readUserConfig();

      switch (action) {
        case 'list':
          context.appendLocalAssistantMessage(JSON.stringify(currentConfig.permissions, null, 2));
          return;
        case 'add':
          if (!rule) {
            context.appendLocalAssistantMessage('Usage: /permissions add <rule>');
            return;
          }
          await context.configStore.patchUserConfig({permissions: Array.from(new Set([...currentConfig.permissions, rule]))});
          await context.refreshConfig();
          context.appendLocalAssistantMessage(`Added permission rule: ${rule}`);
          return;
        case 'remove':
          if (!rule) {
            context.appendLocalAssistantMessage('Usage: /permissions remove <rule>');
            return;
          }
          await context.configStore.patchUserConfig({
            permissions: currentConfig.permissions.filter((candidate) => candidate !== rule),
          });
          await context.refreshConfig();
          context.appendLocalAssistantMessage(`Removed permission rule: ${rule}`);
          return;
        case 'reset':
          await context.configStore.patchUserConfig({permissions: []});
          await context.refreshConfig();
          context.appendLocalAssistantMessage('Permission rules reset.');
          return;
        default:
          context.appendLocalAssistantMessage('Usage: /permissions list | add <rule> | remove <rule> | reset');
      }
    },
  },
{
    description: 'Inspect configured MCP servers and tools',
    name: '/mcp',
    usage: '/mcp [list|tools <server>|test <server>]',
    async run(args, context) {
      const [action = 'list', serverName] = args;
      const resolvedConfig = context.getResolvedConfig();
      const plugins = await loadPluginCatalog({config: resolvedConfig.effective, cwd: context.cwd});
      const endpoints = listConfiguredMcpEndpoints({config: resolvedConfig.effective, plugins});

      if (action === 'list') {
        context.appendLocalAssistantMessage(formatMcpEndpointList(endpoints));
        return;
      }

      if (!serverName) {
        context.appendLocalAssistantMessage('Usage: /mcp [list | tools <server> | test <server>]');
        return;
      }

      const endpoint = findConfiguredMcpEndpoint({
        config: resolvedConfig.effective,
        plugins,
        serverName,
      });

      if (!endpoint) {
        context.appendLocalAssistantMessage(`Unknown MCP server: ${serverName}`);
        return;
      }

      const result = await sharedMcpServerManager.testServer(endpoint.server.name, endpoint.server, context.cwd);
      if (action === 'tools') {
        context.appendLocalAssistantMessage(result.ok
          ? formatMcpToolList({diagnostics: result.diagnostics, tools: result.tools})
          : formatMcpTestResult(result));
        return;
      }

      if (action === 'test') {
        context.appendLocalAssistantMessage(formatMcpTestResult(result));
        return;
      }

      context.appendLocalAssistantMessage('Usage: /mcp [list | tools <server> | test <server>]');
    },
  },
{
    description: 'Fetch or search the live web with strict network approvals',
    name: '/web',
    usage: '/web fetch <url> | /web search <query> | /web research <query>',
    async run(args, context) {
      const [action, ...rest] = args;
      const value = rest.join(' ').trim();
      if (!action || !value) {
        context.appendLocalAssistantMessage('Usage: /web fetch <url> | /web search <query> | /web research <query>');
        return;
      }

      if (action === 'fetch') {
        await context.runTool('web_fetch', {url: value});
        return;
      }

      if (action === 'search') {
        await context.runTool('web_search', {query: value});
        return;
      }

      if (action === 'research') {
        await context.runTool('web_research', {query: value});
        return;
      }

      context.appendLocalAssistantMessage('Usage: /web fetch <url> | /web search <query> | /web research <query>');
    },
  },
{
    description: 'List available tools',
    name: '/tools',
    usage: '/tools',
    async run(_args, context) {
      const resolvedConfig = context.getResolvedConfig();
      context.toolRegistry.removeBySource(['plugin', 'mcp']);
      await loadExternalTools(context.toolRegistry, resolvedConfig.effective, context.cwd);
      const output = formatToolList(context.toolRegistry.list());
      context.appendLocalAssistantMessage(output);
    },
  },
{
    description: 'Show explicit local security limits',
    examples: ['/security status', '/security limits'],
    name: '/security',
    usage: '/security status|limits',
    async run(_args, context) {
      const {formatSecurityLimits} = await import('../../safety/securityStatus.js');
      context.appendLocalAssistantMessage(formatSecurityLimits());
    },
  },
{
    description: 'Inspect optional command sandbox backends',
    examples: ['/sandbox status', '/sandbox doctor'],
    name: '/sandbox',
    usage: '/sandbox status|doctor',
    async run(_args, context) {
      const {detectSandboxStatus} = await import('../../sandbox/detector.js');
      const {formatSandboxStatus} = await import('../../sandbox/format.js');
      context.appendLocalAssistantMessage(formatSandboxStatus(await detectSandboxStatus()));
    },
  },
{
    description: 'Run local mock-only evaluations',
    examples: ['/eval list', '/eval run smoke', '/eval report'],
    name: '/eval',
    usage: '/eval list|run <name>|report',
    async run(args, context) {
      const {formatEvalList, formatEvalReport} = await import('../../evals/format.js');
      const {loadLatestEvalReport, runEval} = await import('../../evals/runner.js');
      const [subcommand, name] = args;
      if (!subcommand || subcommand === 'list') {
        context.appendLocalAssistantMessage(formatEvalList());
        return;
      }
      if (subcommand === 'run') {
        context.appendLocalAssistantMessage(formatEvalReport(await runEval(context.cwd, name ?? 'smoke')));
        return;
      }
      if (subcommand === 'report') {
        context.appendLocalAssistantMessage(formatEvalReport(await loadLatestEvalReport(context.cwd)));
        return;
      }
      context.appendLocalAssistantMessage('Usage: /eval list|run <name>|report');
    },
  },
{
    description: 'Inspect lifecycle hooks',
    examples: ['/hooks'],
    name: '/hooks',
    usage: '/hooks',
    async run(_args, context) {
      const {formatHooks} = await import('../../hooks/format.js');
      const {HookRegistry} = await import('../../hooks/registry.js');
      context.appendLocalAssistantMessage(formatHooks(await new HookRegistry(context.cwd).list()));
    },
  },
{
    description: 'Manage lifecycle hooks',
    examples: ['/hook list', '/hook test pre-plan-note'],
    name: '/hook',
    usage: '/hook list|test <name>|events',
    async run(args, context) {
      const {formatHookEvents, formatHookRunResult, formatHooks} = await import('../../hooks/format.js');
      const {HookEventLog} = await import('../../hooks/eventLog.js');
      const {HookRegistry} = await import('../../hooks/registry.js');
      const {runHook} = await import('../../hooks/runner.js');
      const [subcommand, name] = args;
      const registry = new HookRegistry(context.cwd);
      if (!subcommand || subcommand === 'list') {
        context.appendLocalAssistantMessage(formatHooks(await registry.list()));
        return;
      }
      if (subcommand === 'events') {
        context.appendLocalAssistantMessage(formatHookEvents(await new HookEventLog(context.cwd).list(20)));
        return;
      }
      if (subcommand === 'test' && name) {
        const hook = (await registry.list()).find((candidate) => candidate.name === name);
        context.appendLocalAssistantMessage(hook ? formatHookRunResult(await runHook(hook, {cwd: context.cwd})) : `Hook not found: ${name}`);
        return;
      }
      context.appendLocalAssistantMessage('Usage: /hook list|test <name>|events');
    },
  },
];
