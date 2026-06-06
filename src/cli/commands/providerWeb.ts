import type {Command} from 'commander';

import type {ProviderTestCliOptions} from '../args.js';
import {collectOptions} from '../commands.js';
import type {CliHandlers} from './types.js';

export const registerProviderWebCommands = (program: Command, handlers: CliHandlers): void => {
  const providerCommand = program.command('provider').description('inspect provider readiness');

  providerCommand
    .command('list')
    .description('list provider readiness and setup status')
    .action(async () => {
      await handlers.providerList();
    });

  providerCommand
    .command('setup')
    .description('show setup guidance for a provider')
    .argument('[provider]', 'provider name, defaults to the active provider')
    .action(async (providerName?: string) => {
      await handlers.providerSetup(providerName);
    });

  providerCommand
    .command('env')
    .description('show environment variable requirements for a provider')
    .argument('[provider]', 'provider name, defaults to the active provider')
    .action(async (providerName?: string) => {
      await handlers.providerEnv(providerName);
    });

  const providerFallbackCommand = providerCommand
    .command('fallback')
    .description('show provider fallback chain readiness for a role')
    .argument('[role]', 'cheap | coding | fast | local | reasoning')
    .action(async (role?: string) => {
      await handlers.providerFallback(role);
    });

  providerFallbackCommand
    .command('test')
    .description('test fallback chain resolution without making provider calls')
    .argument('[role]', 'cheap | coding | fast | local | reasoning')
    .action(async (role?: string) => {
      await handlers.providerFallbackTest(role);
    });

  providerFallbackCommand
    .command('simulate')
    .description('simulate a classified provider failure and fallback behavior')
    .argument('<kind>', 'missing-key | rate-limit | timeout | invalid-response | malformed-tool-call')
    .argument('[role]', 'cheap | coding | fast | local | reasoning')
    .action(async (kind: string, role?: string) => {
      await handlers.providerFallbackSimulate(kind, role);
    });

  providerFallbackCommand
    .command('set')
    .description('set role model and optional fallback from provider:model comma chain')
    .argument('<role>', 'cheap | coding | fast | local | reasoning')
    .argument('<chain>', 'provider:model,provider:model')
    .action(async (role: string, chain: string) => {
      await handlers.providerFallbackSet(role, chain);
    });

  providerCommand
    .command('doctor')
    .description('run provider-specific readiness checks and smoke diagnostics')
    .option('--provider <provider>', 'provider name override for this smoke test')
    .option('--model <model>', 'model override for this smoke test')
    .option('--base-url <url>', 'base URL override for this smoke test')
    .option('--strict', 'treat skipped or weak smoke responses as failures')
    .action(async (options: ProviderTestCliOptions, command: Command) => {
      await handlers.providerDoctor(collectOptions(options, command));
    });

  providerCommand
    .command('test')
    .description('send a tiny connectivity test to the active provider')
    .option('--provider <provider>', 'provider name override for this smoke test')
    .option('--model <model>', 'model override for this smoke test')
    .option('--base-url <url>', 'base URL override for this smoke test')
    .option('--strict', 'treat skipped or weak smoke responses as failures')
    .action(async (options: ProviderTestCliOptions, command: Command) => {
      await handlers.providerTest(collectOptions(options, command));
    });

  providerCommand
    .command('smoke')
    .description('send the minimal working chat request to a provider (e.g. github-models) and report a safe result')
    .argument('[provider]', 'provider name, defaults to the active provider')
    .option('--model <model>', 'model override for this smoke test')
    .option('--strict', 'treat skipped or weak smoke responses as failures')
    .action(async (providerName: string | undefined, options: ProviderTestCliOptions, command: Command) => {
      await handlers.providerTest({
        ...collectOptions(options, command),
        ...(providerName ? {provider: providerName} : {}),
      });
    });

  const modelCommand = program.command('model').description('inspect model catalog and recommendations');

  modelCommand
    .command('list')
    .description('list cataloged models with provider readiness information')
    .argument('[role]', 'cheap | coding | fast | local | reasoning')
    .action(async (role?: string) => {
      await handlers.modelList(role);
    });

  modelCommand
    .command('recommend')
    .description('show recommended models for a specific role')
    .argument('[role]', 'cheap | coding | fast | local | reasoning')
    .action(async (role?: string) => {
      await handlers.modelRecommend(role);
    });

  const ollamaCommand = program.command('ollama').description('inspect local Ollama readiness');

  ollamaCommand
    .command('status')
    .description('check whether the Ollama server is reachable')
    .action(async () => {
      await handlers.ollamaStatus();
    });

  ollamaCommand
    .command('models')
    .description('list installed Ollama models when the server is reachable')
    .action(async () => {
      await handlers.ollamaModels();
    });

  ollamaCommand
    .command('recommend')
    .description('show recommended local Ollama models')
    .action(async () => {
      await handlers.ollamaRecommend();
    });

  ollamaCommand
    .command('pull-hint')
    .description('show the pull command for an Ollama model')
    .argument('<model>', 'model name')
    .action(async (model: string) => {
      await handlers.ollamaPullHint(model);
    });

  const webCommand = program.command('web').description('fetch live web content with strict network permissions');

  webCommand
    .command('fetch')
    .description('fetch a web page and return cleaned text content')
    .argument('<url>', 'absolute http(s) URL')
    .action(async (url: string) => {
      await handlers.webFetch(url);
    });

  webCommand
    .command('search')
    .description('search the web and return top results')
    .argument('<query>', 'search query')
    .action(async (query: string) => {
      await handlers.webSearch(query);
    });

  webCommand
    .command('research')
    .description('compile a brief from live search results')
    .argument('<query>', 'research query')
    .action(async (query: string) => {
      await handlers.webResearch(query);
    });

};
