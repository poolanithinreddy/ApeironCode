import path from 'node:path';

import type {SlashCommandDefinition} from './shared.js';
import {appendSlashMessage} from './format.js';
import {scanProject} from '../../agent/projectScanner.js';
import {rankRelevantFiles} from '../../agent/relevance.js';
import {buildProjectIndex} from '../../context/indexer.js';
import {RepoMapManager} from '../../context/repoMap.js';
import {
  buildRepoIntelligenceReport,
  formatDetailedSymbolMatches,
  formatRepoIntelligenceReport,
  searchProjectSymbolsDetailed,
} from '../../context/repoIntelligence.js';
import {fileExists} from '../../utils/fs.js';

export const createIntelligenceCommands = (): SlashCommandDefinition[] => [
{
    description: 'Show or manage long-lived LSP symbols, diagnostics, definitions, references, sessions, and cache',
    examples: ['/lsp symbols src/agent/loop.ts', '/lsp diagnostics src/agent/loop.ts', '/lsp definition src/agent/loop.ts 10 0', '/lsp sessions', '/lsp cache clear'],
    name: '/lsp',
    usage: '/lsp symbols <file> | /lsp diagnostics <file> | /lsp definition <file> <line> <character> | /lsp references <file> <line> <character> | /lsp sessions [language] | /lsp restart [language] | /lsp stop [language] | /lsp cache | /lsp cache clear',
    async run(args, context) {
      const {LspManager} = await import('../../lsp/manager.js');
      const {LspSymbolsProvider} = await import('../../lsp/symbols.js');
      const {LspDiagnosticsProvider} = await import('../../lsp/diagnostics.js');
      const {LspDefinitionsProvider} = await import('../../lsp/definitions.js');
      const {
        formatCacheSnapshot,
        formatDefinitionResult,
        formatDiagnosticsResult,
        formatReferencesResult,
        formatSessionSnapshots,
        formatSymbolQueryResult,
      } = await import('../../lsp/format.js');

      const [subcommand, ...rest] = args;
      const manager = new LspManager(context.getResolvedConfig().effective.lsp);

      if (!subcommand || subcommand === 'symbols') {
        const file = rest.join(' ').trim();
        if (!file) {
          appendSlashMessage(context, 'Usage: /lsp symbols <file>\nExample: /lsp symbols src/agent/loop.ts');
          return;
        }

        const targetPath = await fileExists(file) ? file : path.resolve(context.cwd, file);
        if (!(await fileExists(targetPath))) {
          appendSlashMessage(context, `File not found: ${file}`);
          return;
        }

        const provider = new LspSymbolsProvider(manager);
        const result = await provider.getFileSymbolsDetailed(targetPath, {cwd: context.cwd});
        appendSlashMessage(context, formatSymbolQueryResult(result));
        return;
      }

      if (subcommand === 'diagnostics') {
        const file = rest.join(' ').trim();
        if (!file) {
          appendSlashMessage(context, 'Usage: /lsp diagnostics <file>\nExample: /lsp diagnostics src/agent/loop.ts');
          return;
        }

        const targetPath = await fileExists(file) ? file : path.resolve(context.cwd, file);
        if (!(await fileExists(targetPath))) {
          appendSlashMessage(context, `File not found: ${file}`);
          return;
        }

        const provider = new LspDiagnosticsProvider(manager);
        const result = await provider.getFileDiagnostics(targetPath, {cwd: context.cwd});
        appendSlashMessage(context, formatDiagnosticsResult(result));
        return;
      }

      if (subcommand === 'definition') {
        const [file, line, character] = rest;
        if (!file || !line || !character) {
          appendSlashMessage(context, 'Usage: /lsp definition <file> <line> <character>\nExample: /lsp definition src/agent/loop.ts 10 0');
          return;
        }

        const lineNum = Number.parseInt(line, 10);
        const charNum = Number.parseInt(character, 10);
        if (Number.isNaN(lineNum) || Number.isNaN(charNum)) {
          appendSlashMessage(context, 'Error: line and character must be valid integers');
          return;
        }

        const targetPath = await fileExists(file) ? file : path.resolve(context.cwd, file);
        if (!(await fileExists(targetPath))) {
          appendSlashMessage(context, `File not found: ${file}`);
          return;
        }

        const provider = new LspDefinitionsProvider(manager);
        const result = await provider.getDefinition(targetPath, {line: lineNum, character: charNum}, {cwd: context.cwd});
        appendSlashMessage(context, formatDefinitionResult(result));
        return;
      }

      if (subcommand === 'references') {
        const [file, line, character] = rest;
        if (!file || !line || !character) {
          appendSlashMessage(context, 'Usage: /lsp references <file> <line> <character>\nExample: /lsp references src/agent/loop.ts 10 0');
          return;
        }

        const lineNum = Number.parseInt(line, 10);
        const charNum = Number.parseInt(character, 10);
        if (Number.isNaN(lineNum) || Number.isNaN(charNum)) {
          appendSlashMessage(context, 'Error: line and character must be valid integers');
          return;
        }

        const targetPath = await fileExists(file) ? file : path.resolve(context.cwd, file);
        if (!(await fileExists(targetPath))) {
          appendSlashMessage(context, `File not found: ${file}`);
          return;
        }

        const provider = new LspDefinitionsProvider(manager);
        const result = await provider.getReferences(targetPath, {line: lineNum, character: charNum}, {cwd: context.cwd});
        appendSlashMessage(context, formatReferencesResult(result));
        return;
      }

      if (subcommand === 'sessions') {
        const language = rest.join(' ').trim() || undefined;
        appendSlashMessage(context, formatSessionSnapshots(manager.listSessions(language)));
        return;
      }

      if (subcommand === 'restart') {
        const language = rest.join(' ').trim() || undefined;
        const restarted = await manager.restartSessions(language);
        context.refreshSessionState();
        appendSlashMessage(context, `Restarted ${restarted} LSP session${restarted === 1 ? '' : 's'}.`);
        return;
      }

      if (subcommand === 'stop') {
        const language = rest.join(' ').trim() || undefined;
        const stopped = await manager.stopSessions(language);
        context.refreshSessionState();
        appendSlashMessage(context, `Stopped ${stopped} LSP session${stopped === 1 ? '' : 's'}.`);
        return;
      }

      if (subcommand === 'cache') {
        if (rest[0] === 'clear') {
          const before = manager.getCacheSnapshot();
          manager.clearLspCache();
          const after = manager.getCacheSnapshot();
          context.refreshSessionState();
          appendSlashMessage(context, `Cleared LSP cache (${before.entries} -> ${after.entries} entries).`);
          return;
        }

        appendSlashMessage(context, formatCacheSnapshot(manager.getCacheSnapshot()));
        return;
      }

      appendSlashMessage(context, 'Unknown /lsp subcommand. Usage: /lsp symbols <file> | /lsp diagnostics <file> | /lsp definition <file> <line> <character> | /lsp references <file> <line> <character> | /lsp sessions [language] | /lsp restart [language] | /lsp stop [language] | /lsp cache | /lsp cache clear');
    },
  },
{
    description: 'Show repo architecture, map, and symbol intelligence',
    examples: ['/repo', '/repo map', '/repo symbols runAgentLoop'],
    name: '/repo',
    usage: '/repo | /repo map | /repo symbols <query>',
    async run(args, context) {
      const resolvedConfig = context.getResolvedConfig();
      const [subcommand, ...rest] = args;

      if (subcommand === 'map') {
        const mapManager = new RepoMapManager(context.cwd);
        appendSlashMessage(context, await mapManager.getMapSummary(context.cwd));
        return;
      }

      if (subcommand === 'symbols') {
        const query = rest.join(' ').trim();
        if (!query) {
          appendSlashMessage(context, 'Usage: /repo symbols <query>\nExample: /repo symbols runAgentLoop');
          return;
        }

        const matches = await searchProjectSymbolsDetailed({
          cwd: context.cwd,
          ignorePatterns: resolvedConfig.ignorePatterns,
          query,
        });
        appendSlashMessage(context, formatDetailedSymbolMatches(matches, query));
        return;
      }

      if (subcommand === 'budget') {
        const {RepoBrainIndexStore} = await import('../../context/indexStore.js');
        const {buildTokenBudgetReport, formatTokenBudgetReport} = await import('../../context/tokenBudget.js');
        const repoBrain = await new RepoBrainIndexStore(context.cwd).load();
        appendSlashMessage(context, formatTokenBudgetReport(buildTokenBudgetReport(repoBrain.files.map((file) => file.summary), 8_000)));
        return;
      }

      if (subcommand === 'why' || subcommand === 'explain') {
        const {packContext, formatPackedContext} = await import('../../context/contextPacker.js');
        const {summarizeFile} = await import('../../context/fileSummaries.js');
        const prompt = rest.join(' ').trim() || context.agent.currentSession.lastGoal || 'summarize the current repo';
        const projectScan = await scanProject(context.cwd);
        const relevantFiles = await rankRelevantFiles({
          config: resolvedConfig.effective,
          cwd: context.cwd,
          projectScan,
          prompt,
        });
        const summaries = (await Promise.all(relevantFiles.slice(0, 8).map(async (file) => {
          try {
            return await summarizeFile(context.cwd, file.path);
          } catch {
            return null;
          }
        }))).filter((summary): summary is NonNullable<typeof summary> => summary !== null);
        const packed = packContext(summaries, 2_500);
        appendSlashMessage(context, [
          `Context query: ${prompt}`,
          formatPackedContext(packed),
          '',
          'Reasons:',
          ...relevantFiles.slice(0, 8).map((file) => `- ${file.path}: ${file.reason.join(', ') || 'heuristic match'}`),
        ].join('\n'));
        return;
      }

      const report = await buildRepoIntelligenceReport({
        cwd: context.cwd,
        ignorePatterns: resolvedConfig.ignorePatterns,
      });
      appendSlashMessage(context, formatRepoIntelligenceReport(report));
    },
  },
{
    description: 'Show project summary and relevant files for a query',
    examples: ['/context explain the repo', '/context symbols runAgentLoop', '/context refresh --force'],
    name: '/context',
    usage: '/context [query] | /context files <query> | /context symbols <query> | /context refresh [--force]',
    async run(args, context) {
      const resolvedConfig = context.getResolvedConfig();
      const [subcommand, ...rest] = args;
      if (subcommand === 'refresh') {
        const force = rest.includes('--force');
        const mapManager = new RepoMapManager(context.cwd);
        const {map, status} = await mapManager.ensureFreshMap(context.cwd, {force});
        appendSlashMessage(context, [
          `Repository map status: ${status.stale ? 'stale' : 'fresh'}`,
          `Reasons: ${status.staleReasons.length > 0 ? status.staleReasons.join('; ') : 'none'}`,
          `Important files: ${mapManager.getImportantFiles(map).join(', ') || 'none'}`,
        ].join('\n'));
        return;
      }

      if (subcommand === 'symbols') {
        const query = rest.join(' ').trim();
        if (!query) {
          appendSlashMessage(context, 'Usage: /context symbols <query>\nExample: /context symbols runAgentLoop');
          return;
        }

        const matches = await searchProjectSymbolsDetailed({
          cwd: context.cwd,
          ignorePatterns: resolvedConfig.ignorePatterns,
          query,
        });
        appendSlashMessage(context, formatDetailedSymbolMatches(matches, query));
        return;
      }

      const prompt = (subcommand === 'files' ? rest.join(' ') : args.join(' ')).trim()
        || context.agent.currentSession.lastGoal
        || 'summarize the current repo';
      const projectScan = await scanProject(context.cwd);
      const mapManager = new RepoMapManager(context.cwd);
      const {map, status} = await mapManager.ensureFreshMap(context.cwd);
      const index = await buildProjectIndex(context.cwd, resolvedConfig.ignorePatterns);
      const promptTerms = prompt
        .toLowerCase()
        .split(/[^a-z0-9_]+/u)
        .filter((term) => term.length >= 3);
      const symbolMatches = index
        .map((entry) => {
          const matches = entry.symbols.filter((symbol) => promptTerms.some((term) => symbol.toLowerCase().includes(term)));
          return matches.length > 0 ? `${entry.path} (${matches.slice(0, 5).join(', ')})` : null;
        })
        .filter((value): value is string => value !== null)
        .slice(0, 5);
      const relevantFiles = await rankRelevantFiles({
        config: resolvedConfig.effective,
        cwd: context.cwd,
        projectScan,
        prompt,
      });
      appendSlashMessage(context,
        [
          projectScan.projectSummary,
          '',
          `Repository map: ${status.stale ? 'stale' : 'fresh'}${status.ageMs !== null ? ` (${Math.max(0, Math.round(status.ageMs / 60000))}m old)` : ''}`,
          `Important files: ${mapManager.getImportantFiles(map).join(', ') || 'none'}`,
          '',
          'Relevant files:',
          ...(relevantFiles.length > 0
            ? relevantFiles.map((file) => `- ${file.path} (${file.reason.join(', ') || 'heuristic match'})`)
            : ['- none']),
          '',
          'Symbol matches:',
          ...(symbolMatches.length > 0 ? symbolMatches.map((match) => `- ${match}`) : ['- none']),
        ].join('\n'),
      );
    },
  },
];
