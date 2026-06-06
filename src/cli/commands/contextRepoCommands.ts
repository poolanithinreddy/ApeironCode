import type {Command} from 'commander';
import type {CliHandlers} from './types.js';
import type {ContextRefreshCliOptions} from '../args.js';

const collect = <T extends object>(options: T, command?: Command): T => {
  if (!command) return options;
  const parent = command.parent ? collect((command.parent.opts() ?? {}) as T, command.parent) : ({} as T);
  return {...parent, ...options};
};

export const registerContextAndRepoCommands = (program: Command, handlers: CliHandlers): void => {
  const contextCommand = program.command('context').description('inspect and refresh project context');

  contextCommand
    .command('refresh')
    .description('refresh the repository map and context')
    .option('--force', 'force a repo-map refresh even when it appears fresh')
    .action(async (options: ContextRefreshCliOptions, command: Command) => {
      await handlers.contextRefresh?.(collect(options, command));
    });

  contextCommand
    .command('index')
    .description('build the token-efficient repo brain index')
    .action(async () => {
      await handlers.contextIndex();
    });

  contextCommand
    .command('budget')
    .description('show context token budget and savings estimate')
    .action(async () => {
      await handlers.contextBudget();
    });

  contextCommand
    .command('explain')
    .description('explain why context would be selected for a query')
    .argument('<query>', 'natural language query')
    .action(async (query: string) => {
      await handlers.contextExplain(query);
    });

  contextCommand
    .command('why')
    .description('show context selection rationale for the latest index or a query')
    .argument('[query]', 'optional natural language query')
    .action(async (query?: string) => {
      await handlers.contextWhy(query);
    });

  contextCommand
    .command('files')
    .description('show the most relevant files for a query')
    .argument('<query>', 'natural language query')
    .action(async (query: string) => {
      await handlers.contextFiles(query);
    });

  contextCommand
    .command('map')
    .description('show the repository map')
    .action(async () => {
      await handlers.contextMap?.();
    });

  contextCommand
    .command('symbols')
    .description('search indexed symbols for a query')
    .argument('<query>', 'symbol search query')
    .action(async (query: string) => {
      await handlers.contextSymbols(query);
    });

  contextCommand
    .command('plan')
    .description('preview the context plan for a prompt')
    .argument('<prompt>', 'natural language prompt')
    .action(async (prompt: string) => {
      await handlers.contextPlan?.(prompt);
    });

  contextCommand
    .command('affected')
    .description('show files affected by changes to a given file')
    .argument('<file>', 'project-relative path')
    .action(async (file: string) => {
      await handlers.contextAffected?.(file);
    });

  contextCommand
    .command('view')
    .description('show current context snapshot (selected files, memory items, token budget)')
    .action(async () => {
      await handlers.contextView?.();
    });

  contextCommand
    .command('tests')
    .description('show tests likely related to a source file')
    .argument('<file>', 'project-relative source path')
    .action(async (file: string) => {
      await handlers.contextTests?.(file);
    });

  const repoCommand = program.command('repo').description('show architecture and dependency intelligence for this repository');

  repoCommand
    .action(async () => {
      await handlers.repoSummary();
    });

  repoCommand
    .command('map')
    .description('show the repository map summary')
    .action(async () => {
      await handlers.repoMap();
    });

  repoCommand
    .command('symbols')
    .description('search symbols with line context and dependency hints')
    .argument('<query>', 'symbol search query')
    .action(async (query: string) => {
      await handlers.repoSymbols(query);
    });
};
