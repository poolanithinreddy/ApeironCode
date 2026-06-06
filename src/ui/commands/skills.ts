import type {SlashCommandDefinition} from './shared.js';

export const createSkillsCommands = (): SlashCommandDefinition[] => [
{
    description: 'Manage reusable local skills',
    examples: ['/skills'],
    name: '/skills',
    usage: '/skills',
    async run(_args, context) {
      const {formatSkillBrowser} = await import('../../skills/format.js');
      const {SkillStore} = await import('../../skills/store.js');
      context.appendLocalAssistantMessage(formatSkillBrowser(await new SkillStore(context.cwd).list()));
    },
  },
{
    description: 'Show or run a local skill',
    examples: ['/skill browser', '/skill templates', '/skill show fix-tests', '/skill run explain-repo architecture'],
    name: '/skill',
    usage: '/skill browser|templates|list|show|run|test <name> [input]',
    async run(args, context) {
      const {formatSkillBrowser, formatSkillDetail, formatSkillList, formatSkillRunPlan, formatSkillTemplates} = await import('../../skills/format.js');
      const {buildSkillRunPlan} = await import('../../skills/runner.js');
      const {SkillStore} = await import('../../skills/store.js');
      const [subcommand, name, ...rest] = args;
      const store = new SkillStore(context.cwd);
      if (subcommand === 'browser') {
        context.appendLocalAssistantMessage(formatSkillBrowser(await store.list(), name ? {search: [name, ...rest].join(' ')} : undefined));
        return;
      }
      if (subcommand === 'templates') {
        context.appendLocalAssistantMessage(formatSkillTemplates());
        return;
      }
      if (!subcommand || subcommand === 'list') {
        context.appendLocalAssistantMessage(formatSkillList(await store.list()));
        return;
      }
      if (!name) {
        context.appendLocalAssistantMessage('Usage: /skill browser|templates|list|show|run|test <name> [input]');
        return;
      }
      const skill = await store.load(name);
      if (!skill) {
        context.appendLocalAssistantMessage(`Skill not found: ${name}`);
        return;
      }
      if (subcommand === 'show') {
        context.appendLocalAssistantMessage(formatSkillDetail(skill));
        return;
      }
      if (subcommand === 'test') {
        context.appendLocalAssistantMessage(`Skill ${name} is valid.\n\n${formatSkillRunPlan(buildSkillRunPlan(skill, rest.join(' ')))}`);
        return;
      }
      if (subcommand === 'trust') {
        await store.updateTags(name, (tags) => [...tags.filter((tag) => tag !== 'untrusted'), 'trusted']);
        context.appendLocalAssistantMessage(`Trusted skill ${name}.`);
        return;
      }
      if (subcommand === 'enable') {
        await store.updateTags(name, (tags) => tags.filter((tag) => tag !== 'disabled'));
        context.appendLocalAssistantMessage(`Enabled skill ${name}.`);
        return;
      }
      if (subcommand === 'disable') {
        await store.updateTags(name, (tags) => [...tags.filter((tag) => tag !== 'trusted'), 'disabled']);
        context.appendLocalAssistantMessage(`Disabled skill ${name}.`);
        return;
      }
      if (subcommand === 'run') {
        const plan = buildSkillRunPlan(skill, rest.join(' '));
        context.appendLocalAssistantMessage(formatSkillRunPlan(plan));
        const allowedTools = Array.from(new Set([
          ...skill.metadata.allowedTools,
          'package_info',
          'project_tree',
        ]));
        context.toolRegistry.setAllowedTools(allowedTools);
        try {
          const result = await context.agent.run({
            allowModeInference: false,
            mode: 'feature',
            model: skill.metadata.modelPreference ?? context.getResolvedConfig().effective.defaultModel,
            prompt: plan.prompt,
            providerName: context.getResolvedConfig().effective.defaultProvider,
            skillName: skill.metadata.name,
          });
          context.appendLocalAssistantMessage(result.finalMessage.content.trim());
          context.refreshSessionState();
        } finally {
          context.toolRegistry.setAllowedTools(null);
        }
        return;
      }
      context.appendLocalAssistantMessage('Usage: /skill browser|templates|list|show|run|test <name> [input]');
    },
  },
{
    description: 'Show quality workflows',
    examples: ['/workflow list', '/workflow show fix-tests', '/workflow run fix-tests failing math test --dry-run'],
    name: '/workflow',
    usage: '/workflow list|show <name>|run <name> <task> [--dry-run]|report <runId>',
    async run(args, context) {
      const {getWorkflowRecipe, listWorkflowRecipes} = await import('../../workflows/runtime/recipeRegistry.js');
      const {formatWorkflowRecipe, formatWorkflowRecipeList, runWorkflowRecipe} = await import('../../workflows/runtime/recipeRunner.js');
      const {formatWorkflowReport, WorkflowReportStore} = await import('../../workflows/runtime/reports.js');
      const [subcommand, name, ...taskParts] = args;
      if (!subcommand || subcommand === 'list') {
        context.appendLocalAssistantMessage(formatWorkflowRecipeList(listWorkflowRecipes()));
        return;
      }
      if (subcommand === 'show' && name) {
        const recipe = getWorkflowRecipe(name);
        context.appendLocalAssistantMessage(recipe ? formatWorkflowRecipe(recipe) : `Unknown workflow: ${name}`);
        return;
      }
      if (subcommand === 'report' && name) {
        context.appendLocalAssistantMessage(formatWorkflowReport(await new WorkflowReportStore(context.cwd).get(name)));
        return;
      }
      if (subcommand === 'run' && name) {
        const dryRun = taskParts.includes('--dry-run');
        const task = taskParts.filter((part) => part !== '--dry-run').join(' ').trim() || name.replace(/-/gu, ' ');
        context.appendLocalAssistantMessage(formatWorkflowReport(await runWorkflowRecipe({
          config: context.getResolvedConfig(),
          cwd: context.cwd,
          dryRun,
          recipeId: name,
          task,
        })));
        context.refreshSessionState();
        return;
      }
      context.appendLocalAssistantMessage('Usage: /workflow list|show <name>|run <name> <task> [--dry-run]|report <runId>');
    },
  },
];
