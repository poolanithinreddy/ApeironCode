import type {SlashCommandDefinition} from './shared.js';
import {appendSlashMessage, formatSlashCommandDetails} from './format.js';
import {normalizeModelRole} from './parser.js';
import {getSlashDefinitions} from './shared.js';
import {getModeDescription} from '../../agent/modePrompts.js';
import {AGENT_MODES, isAgentMode} from '../../agent/types.js';
import {formatFallbackChain, resolveProviderChain} from '../../providers/fallbacks.js';
import {
  checkOllamaStatus,
  formatOllamaModels,
  formatOllamaRecommendations,
  formatOllamaStatus,
} from '../../providers/ollamaUx.js';
import {
  formatModelDisplayEntries,
  formatModelRecommendations,
  formatProviderCatalog,
  formatProviderSetupDetails,
  listModelDisplayEntries,
  recommendModels,
} from '../../providers/providerUx.js';
import {runProviderSmokeTest} from '../../diagnostics/doctor.js';

export const createAgentCommands = (): SlashCommandDefinition[] => [
{
    category: 'Start',
    description: 'Show compact current status and security limits',
    examples: ['/status'],
    name: '/status',
    status: 'read-only',
    usage: '/status',
    async run(_args, context) {
      const {formatSecurityLimits} = await import('../../safety/securityStatus.js');
      const config = context.getResolvedConfig();
      context.appendLocalAssistantMessage([
        `Provider/model: ${config.effective.defaultProvider}/${config.effective.defaultModel}`,
        `Approval mode: ${config.effective.approvalMode}`,
        `Local only: ${config.effective.localOnly ? 'yes' : 'no'}`,
        '',
        formatSecurityLimits(),
      ].join('\n'));
    },
  },
{
    category: 'Start',
    description: 'Alias for explaining the current repository',
    examples: ['/explain repo', '/explain this project'],
    name: '/explain',
    status: 'stable',
    usage: '/explain repo',
    async run(args, context) {
      const topic = args.join(' ').trim() || 'repo';
      await context.runPrompt(`Explain ${topic === 'repo' ? 'this repository' : topic}. Focus on architecture, commands, and the next useful actions.`, 'explain');
    },
  },
{
    description: 'Show or change the active agent mode',
    category: 'Agent',
    name: '/mode',
    status: 'stable',
    usage: '/mode [chat|fix|debug|feature|explain|test-fix|review|plan|edit|commit|refactor|autonomous-with-approval]',
    run(args, context) {
      const requestedMode = args.join(' ').trim();
      if (!requestedMode) {
        const currentMode = context.getCurrentMode();
        context.appendLocalAssistantMessage(
          [
            `Current mode: ${currentMode}`,
            getModeDescription(currentMode),
            '',
            'Available modes:',
            ...AGENT_MODES.map((mode) => `- ${mode}: ${getModeDescription(mode)}`),
          ].join('\n'),
        );
        return;
      }

      if (!isAgentMode(requestedMode)) {
        context.appendLocalAssistantMessage(
          `Unknown mode: ${requestedMode}. Valid modes: ${AGENT_MODES.join(', ')}`,
        );
        return;
      }

      context.setCurrentMode(requestedMode);
      context.setStatus(`Mode: ${requestedMode}`);
      context.appendLocalAssistantMessage(`Mode set to ${requestedMode}. ${getModeDescription(requestedMode)}`);
    },
  },
{
    description: 'List, recommend, or set the default model',
    name: '/model',
    usage: '/model [name|list [role]|recommend [role]]',
    async run(args, context) {
      const resolvedConfig = context.getResolvedConfig();
      const [action, ...rest] = args;

      if (!action || action === 'list') {
        const role = normalizeModelRole(rest[0]);
        context.appendLocalAssistantMessage(
          formatModelDisplayEntries(listModelDisplayEntries(resolvedConfig.effective, context.providerRegistry, role)),
        );
        return;
      }

      if (action === 'recommend') {
        const role = normalizeModelRole(rest[0]) ?? 'coding';
        context.appendLocalAssistantMessage(
          formatModelRecommendations(recommendModels(resolvedConfig.effective, context.providerRegistry, role), role, resolvedConfig.effective, context.providerRegistry),
        );
        return;
      }

      await context.configStore.setUserValue('model', action);
      await context.refreshConfig();
      context.appendLocalAssistantMessage(`Default model set to ${action}.`);
    },
  },
{
    description: 'List, diagnose, or set the default provider',
    examples: ['/provider list', '/provider doctor', '/provider setup mock', '/provider fallback coding'],
    name: '/provider',
    usage: '/provider [name|list|setup [provider]|fallback [role]|doctor|test]',
    async run(args, context) {
      const resolvedConfig = context.getResolvedConfig();
      const [action, ...rest] = args;

      if (!action || action === 'list') {
        appendSlashMessage(context, formatProviderCatalog());
        return;
      }

      if (action === 'setup') {
        const providerName = rest[0] ?? resolvedConfig.effective.defaultProvider;
        appendSlashMessage(context, formatProviderSetupDetails(providerName, resolvedConfig.effective));
        return;
      }

      if (action === 'fallback') {
        if (rest[0] === 'simulate') {
          const {formatProviderFallbackSimulation, simulateProviderFallback} = await import('../../providers/fallbackSimulation.js');
          const kind = rest[1] ?? 'rate-limit';
          const role = normalizeModelRole(rest[2]) ?? 'coding';
          if (!['invalid-response', 'malformed-tool-call', 'missing-key', 'rate-limit', 'timeout'].includes(kind)) {
            appendSlashMessage(context, 'Usage: /provider fallback simulate missing-key|rate-limit|timeout|invalid-response|malformed-tool-call [role]');
            return;
          }
          appendSlashMessage(context, formatProviderFallbackSimulation(simulateProviderFallback(
            resolvedConfig.effective,
            kind as 'invalid-response' | 'malformed-tool-call' | 'missing-key' | 'rate-limit' | 'timeout',
            role,
          )));
          return;
        }
        const role = normalizeModelRole(rest[0]) ?? 'coding';
        appendSlashMessage(context, formatFallbackChain(resolveProviderChain(role, resolvedConfig.effective)));
        return;
      }

      if (action === 'doctor' || action === 'test') {
        const result = await runProviderSmokeTest({
          config: resolvedConfig,
          providerRegistry: context.providerRegistry,
          strictProviderConnectivity: action === 'doctor',
        });
        appendSlashMessage(context, [
          `${action === 'doctor' ? 'Provider doctor' : 'Provider test'}: ${result.status}/${result.confidence}`,
          result.detail,
          result.fix ? `Fix: ${result.fix}` : null,
        ].filter(Boolean).join('\n'));
        return;
      }

      await context.configStore.setUserValue('provider', action);
      await context.refreshConfig();
      appendSlashMessage(context, `Default provider set to ${action}.`);
    },
  },
{
    description: 'Inspect local Ollama server and model recommendations',
    examples: ['/ollama status', '/ollama models', '/ollama recommend'],
    name: '/ollama',
    usage: '/ollama [status|models|recommend]',
    async run(args, context) {
      const action = args[0] ?? 'status';
      const resolvedConfig = context.getResolvedConfig();
      const status = await checkOllamaStatus(resolvedConfig.effective);
      if (action === 'models') {
        appendSlashMessage(context, formatOllamaModels(status));
        return;
      }
      if (action === 'recommend') {
        appendSlashMessage(context, formatOllamaRecommendations(status));
        return;
      }
      appendSlashMessage(context, formatOllamaStatus(status));
    },
  },
{
    description: 'Run a focused bug-fix workflow prompt',
    examples: ['/fix failing tests', '/fix reproduce the approval prompt bug'],
    name: '/fix',
    usage: '/fix <request>',
    async run(args, context) {
      const prompt = args.join(' ').trim();
      if (!prompt) {
        appendSlashMessage(context, formatSlashCommandDetails(getSlashDefinitions().find((definition) => definition.name === '/fix')!));
        return;
      }

      await context.runPrompt(prompt, 'fix');
    },
  },
{
    description: 'Run a debugging workflow prompt',
    examples: ['/debug paste the stack trace', '/debug why repo symbols are empty'],
    name: '/debug',
    usage: '/debug <request>',
    async run(args, context) {
      const prompt = args.join(' ').trim();
      if (!prompt) {
        appendSlashMessage(context, formatSlashCommandDetails(getSlashDefinitions().find((definition) => definition.name === '/debug')!));
        return;
      }

      await context.runPrompt(prompt, 'debug');
    },
  },
{
    description: 'Run a feature implementation workflow prompt',
    examples: ['/feature add a dark mode toggle', '/feature add a repo summary widget'],
    name: '/feature',
    usage: '/feature <request>',
    async run(args, context) {
      const prompt = args.join(' ').trim();
      if (!prompt) {
        appendSlashMessage(context, formatSlashCommandDetails(getSlashDefinitions().find((definition) => definition.name === '/feature')!));
        return;
      }

      await context.runPrompt(prompt, 'feature');
    },
  },
{
    description: 'Review the current git diff or a named scope',
    examples: ['/review', '/review current diff', '/review src/auth.ts'],
    name: '/review',
    usage: '/review [scope]',
    async run(args, context) {
      const scope = args.join(' ').trim();
      await context.runPrompt(
        scope
          ? `Review ${scope}. Report critical issues, warnings, and suggestions with concise reasoning and testing gaps.`
          : 'Review the current git diff. Report critical issues, warnings, and suggestions with concise reasoning and testing gaps.',
        'review',
      );
    },
  },
{
    description: 'Run a refactor workflow prompt',
    examples: ['/refactor src/auth.ts', '/refactor simplify the renderer'],
    name: '/refactor',
    usage: '/refactor <request>',
    async run(args, context) {
      const prompt = args.join(' ').trim();
      if (!prompt) {
        appendSlashMessage(context, formatSlashCommandDetails(getSlashDefinitions().find((definition) => definition.name === '/refactor')!));
        return;
      }

      await context.runPrompt(prompt, 'refactor');
    },
  },
{
    description: 'Run project tests',
    name: '/test',
    usage: '/test',
    async run(_args, context) {
      await context.runTool('test_runner', {});
    },
  },
{
    description: 'Run project linting',
    name: '/lint',
    usage: '/lint',
    async run(_args, context) {
      await context.runTool('lint_runner', {});
    },
  },
{
    description: 'Run project build',
    name: '/build',
    usage: '/build',
    async run(_args, context) {
      await context.runTool('build_runner', {});
    },
  },
{
    description: 'Show current session status',
    name: '/status',
    usage: '/status',
    run(_args, context) {
      const session = context.agent.currentSession;
      context.appendLocalAssistantMessage(
        JSON.stringify(
          {
            codeIntelligence: context.getCodeIntelligenceSummary?.() ?? null,
            filesChanged: session.taskState?.filesChanged ?? [],
            filesRead: session.taskState?.filesRead ?? [],
            id: session.id,
            lastGoal: session.lastGoal ?? null,
            mode: session.mode,
            provider: session.provider,
            taskPlanId: session.taskPlanId ?? null,
            title: session.title,
            transcriptPath: session.transcriptPath ?? null,
          },
          null,
          2,
        ),
      );
    },
  },
];
