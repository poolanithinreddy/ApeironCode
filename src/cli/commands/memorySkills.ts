import type {Command} from 'commander';

import type {SearchCliOptions} from '../args.js';
import {collectOptions} from '../commands.js';
import type {CliHandlers} from './types.js';

export const registerMemoryAndSkillCommands = (program: Command, handlers: CliHandlers): void => {
  const memoryCommand = program.command('memory').description('manage project and global memory');

  memoryCommand
    .command('show')
    .description('display current memory')
    .option('--global', 'show global memory instead of project memory')
    .action(async (options: {global?: boolean}) => {
      await handlers.memoryShow(options);
    });

  memoryCommand
    .command('graph')
    .description('show durable memory graph summary')
    .action(async () => {
      await handlers.memoryGraph();
    });

  memoryCommand
    .command('related')
    .description('find graph memories related to a query')
    .argument('<query>', 'query, file path, symbol, error, or task goal')
    .action(async (query: string) => {
      await handlers.memoryRelated(query);
    });

  memoryCommand
    .command('review')
    .description('review graph memory for stale, duplicate, conflicting, or secret-like facts')
    .option('--status <status>', 'filter suggestions by pending | approved | rejected | applied')
    .option('--confidence <confidence>', 'filter suggestions by low | medium | high')
    .option('--source <source>', 'filter suggestions by source')
    .option('--team <teamRunId>', 'filter suggestions related to a team run')
    .action(async (options: {confidence?: string; source?: string; status?: string; team?: string}) => {
      await handlers.memoryReview(options);
    });

  memoryCommand
    .command('prune')
    .description('remove stale graph facts and dangling edges')
    .action(async () => {
      await handlers.memoryPrune();
    });

  memoryCommand
    .command('learn')
    .description('store a user-approved durable memory graph fact')
    .argument('<fact>', 'fact text')
    .action(async (fact: string) => {
      await handlers.memoryLearn(fact);
    });

  memoryCommand
    .command('summarize')
    .description('summarize and compact memory')
    .option('--global', 'summarize global memory instead of project memory')
    .action(async (options: {global?: boolean}) => {
      await handlers.memorySummarize(options);
    });

  memoryCommand
    .command('edit')
    .description('edit memory in the default editor')
    .option('--global', 'edit global memory instead of project memory')
    .action(async (options: {global?: boolean}) => {
      await handlers.memoryEdit(options);
    });

  memoryCommand
    .command('clear')
    .description('clear memory')
    .option('--global', 'clear global memory instead of project memory')
    .action(async (options: {global?: boolean}) => {
      await handlers.memoryClear(options);
    });

  memoryCommand
    .command('search')
    .description('search project, global, and session-derived memory')
    .argument('<query>', 'search query')
    .option('--all', 'include session-derived memory from all saved projects')
    .option('--limit <count>', 'limit the number of results', (value: string) => Number.parseInt(value, 10))
    .action(async (query: string, options: SearchCliOptions, command: Command) => {
      await handlers.memorySearch(query, collectOptions(options, command));
    });

  memoryCommand
    .command('why')
    .description('show why memory was loaded for the latest run or query')
    .argument('[query]', 'optional memory query')
    .action(async (query?: string) => {
      await handlers.memoryWhy(query);
    });
  memoryCommand.command('suggestions').description('list memory suggestions awaiting review').action(async () => {
    await handlers.memorySuggestions();
  });
  const memorySuggestionCommand = memoryCommand.command('suggestion').description('inspect memory suggestions');
  memorySuggestionCommand.command('show').argument('<id>', 'suggestion id').description('show a memory suggestion').action(async (id: string) => {
    await handlers.memorySuggestionShow(id);
  });
  memoryCommand.command('approve').argument('[id]', 'suggestion id').option('--all', 'approve and apply all pending suggestions').description('approve a memory suggestion').action(async (id: string | undefined, options: {all?: boolean}) => {
    await handlers.memorySuggestionApprove(id, options);
  });
  memoryCommand.command('reject').argument('[id]', 'suggestion id').option('--all', 'reject all pending suggestions').description('reject a memory suggestion').action(async (id: string | undefined, options: {all?: boolean}) => {
    await handlers.memorySuggestionReject(id, options);
  });
  memoryCommand.command('conflicts').description('show conflicting memory facts and suggestions').action(async () => {
    await handlers.memoryConflicts();
  });
  memoryCommand.command('stale').description('show stale memory facts').action(async () => {
    await handlers.memoryStale();
  });
  memoryCommand.command('source').argument('<id>', 'memory entity, edge, or suggestion id').description('show where a memory item came from').action(async (id: string) => {
    await handlers.memorySource(id);
  });
  memoryCommand.command('rollback').argument('<id>', 'memory entity or edge id').option('--yes', 'confirm rollback').description('remove a memory fact after confirmation').action(async (id: string, options: {yes?: boolean}) => {
    await handlers.memoryRollback(id, options);
  });
  memoryCommand.command('forget-session').argument('<sessionId>', 'session id').option('--yes', 'confirm forgetting session-linked facts').description('remove memory facts linked to a session').action(async (sessionId: string, options: {yes?: boolean}) => {
    await handlers.memoryForgetSession(sessionId, options);
  });

  memoryCommand
    .command('explain')
    .description('explain why memory would be selected for a query')
    .argument('<query>', 'natural language query')
    .action(async (query: string) => {
      await handlers.memoryExplain?.(query);
    });

  memoryCommand
    .command('verify')
    .description('verify memory file references against the current project')
    .action(async () => {
      await handlers.memoryVerify?.();
    });

  memoryCommand
    .command('compact')
    .description('compact memory using kind-aware compaction v2 and show report')
    .action(async () => {
      await handlers.memoryCompact?.();
    });

  memoryCommand
    .command('export')
    .description('export memory to JSON with secrets redacted')
    .option('--redacted', 'redact secret-like content (default: true)')
    .action(async (options: {redacted?: boolean}) => {
      await handlers.memoryExport?.(options);
    });

  memoryCommand
    .command('forget')
    .description('remove a specific memory entity by ID after confirmation')
    .argument('<id>', 'memory entity id')
    .option('--yes', 'confirm removal without prompt')
    .action(async (id: string, options: {yes?: boolean}) => {
      await handlers.memoryForget?.(id, options);
    });

  const skillsCommand = program.command('skills').description('list local reusable skills');
  skillsCommand.action(async () => {
    await handlers.skills();
  });

  const skillCommand = program.command('skill').description('manage local reusable skills');

  skillCommand
    .command('browser')
    .description('show installed skills with trust, risk, tools, and examples')
    .option('--filter <filter>', 'enabled | disabled | trusted | risky')
    .option('--search <query>', 'search name, description, tags, tools, and examples')
    .action(async (options: {filter?: string; search?: string}) => {
      await handlers.skillBrowser(options);
    });

  skillCommand
    .command('templates')
    .description('show starter skill templates')
    .action(async () => {
      await handlers.skillTemplates();
    });

  skillCommand
    .command('list')
    .description('list local skills')
    .action(async () => {
      await handlers.skillList();
    });

  skillCommand
    .command('show')
    .argument('<name>', 'skill name')
    .description('show a skill')
    .action(async (name: string) => {
      await handlers.skillShow(name);
    });

  skillCommand
    .command('run')
    .argument('<name>', 'skill name')
    .argument('[input]', 'input for the skill')
    .option('--input <input>', 'input for the skill')
    .option('--no-run', 'print the scoped skill run plan without executing')
    .description('run a skill with scoped tools')
    .action(async (name: string, inputArg: string | undefined, options: {input?: string; run?: boolean}) => {
      await handlers.skillRun(name, {
        input: options.input ?? inputArg,
        noRun: options.run === false,
      });
    });

  skillCommand.command('create').argument('<name>', 'skill name').description('create a starter skill').action(async (name: string) => {
    await handlers.skillCreate(name);
  });

  skillCommand.command('generate').argument('<description>', 'workflow description').description('generate a read-only skill scaffold').action(async (description: string) => {
    await handlers.skillGenerate(description);
  });

  skillCommand.command('validate').argument('<name>', 'skill name').description('validate a skill').action(async (name: string) => {
    await handlers.skillValidate(name);
  });
  skillCommand.command('trust').argument('<name>', 'skill name').description('mark a skill as trusted').action(async (name: string) => {
    await handlers.skillTrust(name);
  });
  skillCommand.command('enable').argument('<name>', 'skill name').description('enable a skill').action(async (name: string) => {
    await handlers.skillEnable(name);
  });
  skillCommand.command('disable').argument('<name>', 'skill name').description('disable a skill').action(async (name: string) => {
    await handlers.skillDisable(name);
  });

  skillCommand.command('test').argument('<name>', 'skill name').description('validate a skill and print its dry-run prompt plan').action(async (name: string) => {
    await handlers.skillValidate(name);
    await handlers.skillRun(name, {noRun: true});
  });

  skillCommand.command('delete').argument('<name>', 'skill name').description('delete a local skill').action(async (name: string) => {
    await handlers.skillDelete(name);
  });

  skillCommand.command('export').argument('<name>', 'skill name').description('print skill metadata and markdown').action(async (name: string) => {
    await handlers.skillExport(name);
  });

  skillCommand.command('import').argument('<path>', 'skill.json path or skill directory').description('import a skill').action(async (filePath: string) => {
    await handlers.skillImport(filePath);
  });

};
