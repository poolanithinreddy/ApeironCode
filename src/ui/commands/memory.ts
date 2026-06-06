import type {SlashCommandDefinition} from './shared.js';
import {parseSearchArguments} from './parser.js';
import {MemoryManager} from '../../agent/memoryManager.js';
import {formatSearchResults, searchWorkspaceHistory} from '../../history/searchIndex.js';

export const createMemoryCommands = (): SlashCommandDefinition[] => [
{
    description: 'Inspect or edit project memory',
    name: '/memory',
    usage: '/memory show|add|edit|clear|search|why [text]',
    async run(args, context) {
      const [memoryCommand, ...rest] = args;
      const memoryArgument = rest.join(' ').trim();
      const resolvedConfig = context.getResolvedConfig();
      const memoryManager = new MemoryManager(context.cwd);

      switch (memoryCommand) {
        case 'show':
          context.appendLocalAssistantMessage(resolvedConfig.projectMemory ?? 'Project memory is empty.');
          return;
        case 'add':
          if (memoryArgument) {
            await context.runTool('write_file', {
              content: `${(resolvedConfig.projectMemory ?? '').trim()}${resolvedConfig.projectMemory?.trim() ? '\n\n' : ''}${memoryArgument}\n`,
              path: '.apeironcode-agent/memory.md',
            });
            await context.refreshConfig();
            return;
          }
          context.setMemoryInputMode('append');
          context.setStatus('Enter project memory text to append');
          return;
        case 'edit':
          if (memoryArgument) {
            await context.runTool('write_file', {
              content: `${memoryArgument}\n`,
              path: '.apeironcode-agent/memory.md',
            });
            await context.refreshConfig();
            return;
          }
          context.setMemoryInputMode('replace');
          context.setStatus('Enter replacement project memory text');
          return;
        case 'clear':
          await context.runTool('write_file', {content: '', path: '.apeironcode-agent/memory.md'});
          await context.refreshConfig();
          context.appendLocalAssistantMessage('Project memory cleared.');
          return;
        case 'search': {
          const parsed = parseSearchArguments(rest);
          if ('error' in parsed) {
            context.appendLocalAssistantMessage('Usage: /memory search <query> [--all] [--limit <count>]');
            return;
          }

          const results = await searchWorkspaceHistory({
            allSessions: parsed.all,
            cwd: context.cwd,
            limit: parsed.limit,
            query: parsed.query,
            scope: 'memory',
          });
          context.setDashboard({
            query: parsed.query,
            results,
            title: 'Memory Search',
            type: 'search',
          });
          context.appendLocalAssistantMessage(formatSearchResults(results, parsed.query));
          return;
        }
        case 'why': {
          const query = memoryArgument || context.agent.currentSession.lastGoal || context.cwd;
          const {MemoryGraphStore} = await import('../../memory/graphStore.js');
          const {searchMemoryGraph, explainMemorySelection} = await import('../../memory/graphSearch.js');
          const graph = await new MemoryGraphStore(context.cwd).load();
          const graphWhy = explainMemorySelection(searchMemoryGraph(graph, query, 5));
          const latestReasons = context.agent.currentSession.sessionMemory?.memoryWhy;
          if (latestReasons?.length) {
            context.appendLocalAssistantMessage(`${memoryManager.formatMemoryWhy(latestReasons)}\n\nGraph memory:\n${graphWhy}`);
            return;
          }

          const [projectMemory, globalMemory] = await Promise.all([
            memoryManager.loadProjectMemory(),
            memoryManager.loadGlobalMemory(),
          ]);
          context.appendLocalAssistantMessage(
            `${memoryManager.formatMemoryWhy(memoryManager.describeLoadedMemory({globalMemory, projectMemory}))}\n\nGraph memory:\n${graphWhy}`,
          );
          return;
        }
        case 'graph': {
          const {formatMemoryGraphSummary} = await import('../../memory/graphFormat.js');
          const {MemoryGraphStore} = await import('../../memory/graphStore.js');
          context.appendLocalAssistantMessage(formatMemoryGraphSummary(await new MemoryGraphStore(context.cwd).load()));
          return;
        }
        case 'related': {
          const query = memoryArgument;
          if (!query) {
            context.appendLocalAssistantMessage('Usage: /memory related <query>');
            return;
          }
          const {formatRelatedMemories} = await import('../../memory/graphFormat.js');
          const {searchMemoryGraph} = await import('../../memory/graphSearch.js');
          const {MemoryGraphStore} = await import('../../memory/graphStore.js');
          context.appendLocalAssistantMessage(formatRelatedMemories(searchMemoryGraph(await new MemoryGraphStore(context.cwd).load(), query)));
          return;
        }
        case 'review': {
          const {formatMemoryReview} = await import('../../memory/graphFormat.js');
          const {reviewMemoryGraph} = await import('../../memory/graph.js');
          const {MemoryGraphStore} = await import('../../memory/graphStore.js');
          const {MemorySuggestionStore} = await import('../../memory/suggestions.js');
          const {formatMemoryReviewText} = await import('../memoryReviewViewModel.js');
          const reviewStatus = memoryArgument || undefined;
          context.appendLocalAssistantMessage([
            formatMemoryReview(reviewMemoryGraph(await new MemoryGraphStore(context.cwd).load())),
            '',
            formatMemoryReviewText(await new MemorySuggestionStore(context.cwd).list(), reviewStatus ? {status: reviewStatus} : undefined),
          ].join('\n'));
          return;
        }
        case 'suggestion': {
          const [suggestionAction, suggestionId] = rest;
          if (suggestionAction !== 'show' || !suggestionId) {
            context.appendLocalAssistantMessage('Usage: /memory suggestion show <id>');
            return;
          }
          const {formatMemorySuggestionDetail, MemorySuggestionStore} = await import('../../memory/suggestions.js');
          const suggestion = (await new MemorySuggestionStore(context.cwd).list()).find((candidate) => candidate.id === suggestionId) ?? null;
          context.appendLocalAssistantMessage(formatMemorySuggestionDetail(suggestion));
          return;
        }
        case 'suggestions': {
          const {formatMemorySuggestions, MemorySuggestionStore} = await import('../../memory/suggestions.js');
          context.appendLocalAssistantMessage(formatMemorySuggestions(await new MemorySuggestionStore(context.cwd).list()));
          return;
        }
        case 'approve': {
          const {MemorySuggestionStore} = await import('../../memory/suggestions.js');
          const store = new MemorySuggestionStore(context.cwd);
          if (memoryArgument === '--all') {
            const count = await store.applyAll();
            context.appendLocalAssistantMessage(`Applied ${count} memory suggestion${count === 1 ? '' : 's'}.`);
            return;
          }
          if (!memoryArgument) {
            context.appendLocalAssistantMessage('Usage: /memory approve <id> | /memory approve --all');
            return;
          }
          const suggestion = await store.apply(memoryArgument);
          context.appendLocalAssistantMessage(suggestion ? `Applied memory suggestion ${memoryArgument}` : `Memory suggestion not found: ${memoryArgument}`);
          return;
        }
        case 'reject': {
          const {MemorySuggestionStore} = await import('../../memory/suggestions.js');
          const store = new MemorySuggestionStore(context.cwd);
          if (memoryArgument === '--all') {
            const count = await store.rejectAll();
            context.appendLocalAssistantMessage(`Rejected ${count} memory suggestion${count === 1 ? '' : 's'}.`);
            return;
          }
          if (!memoryArgument) {
            context.appendLocalAssistantMessage('Usage: /memory reject <id> | /memory reject --all');
            return;
          }
          const suggestion = await store.reject(memoryArgument);
          context.appendLocalAssistantMessage(suggestion ? `Rejected memory suggestion ${memoryArgument}` : `Memory suggestion not found: ${memoryArgument}`);
          return;
        }
        case 'conflicts': {
          const {formatMemoryFindings} = await import('../../memory/control.js');
          const {reviewMemoryGraph} = await import('../../memory/graph.js');
          const {MemoryGraphStore} = await import('../../memory/graphStore.js');
          context.appendLocalAssistantMessage(formatMemoryFindings('Memory Conflicts', reviewMemoryGraph(await new MemoryGraphStore(context.cwd).load())));
          return;
        }
        case 'stale': {
          const {formatMemoryFindings} = await import('../../memory/control.js');
          const {reviewMemoryGraph} = await import('../../memory/graph.js');
          const {MemoryGraphStore} = await import('../../memory/graphStore.js');
          context.appendLocalAssistantMessage(formatMemoryFindings('Stale Memories', reviewMemoryGraph(await new MemoryGraphStore(context.cwd).load())));
          return;
        }
        case 'source': {
          if (!memoryArgument) {
            context.appendLocalAssistantMessage('Usage: /memory source <id>');
            return;
          }
          const {formatMemorySourceTrace} = await import('../../memory/control.js');
          const {MemoryGraphStore} = await import('../../memory/graphStore.js');
          const {MemorySuggestionStore} = await import('../../memory/suggestions.js');
          context.appendLocalAssistantMessage(formatMemorySourceTrace(
            await new MemoryGraphStore(context.cwd).load(),
            await new MemorySuggestionStore(context.cwd).list(),
            memoryArgument,
          ));
          return;
        }
        case 'rollback': {
          const id = rest.find((entry) => entry !== '--yes');
          if (!id) {
            context.appendLocalAssistantMessage('Usage: /memory rollback <id> --yes');
            return;
          }
          const {rollbackMemoryItem} = await import('../../memory/control.js');
          const {MemoryGraphStore} = await import('../../memory/graphStore.js');
          const store = new MemoryGraphStore(context.cwd);
          const result = rollbackMemoryItem(await store.load(), id, rest.includes('--yes'));
          if (result.changed) {
            await store.save(result.graph);
          }
          context.appendLocalAssistantMessage(result.message);
          return;
        }
        case 'forget-session': {
          const sessionId = rest.find((entry) => entry !== '--yes');
          if (!sessionId) {
            context.appendLocalAssistantMessage('Usage: /memory forget-session <sessionId> --yes');
            return;
          }
          const {forgetSessionMemories} = await import('../../memory/control.js');
          const {MemoryGraphStore} = await import('../../memory/graphStore.js');
          const store = new MemoryGraphStore(context.cwd);
          const result = forgetSessionMemories(await store.load(), sessionId, rest.includes('--yes'));
          if (result.changed) {
            await store.save(result.graph);
          }
          context.appendLocalAssistantMessage(result.message);
          return;
        }
        default:
          context.appendLocalAssistantMessage('Usage: /memory show | add <text> | edit <text> | clear | search <query> | why [query] | graph | related <query> | review | suggestions | approve <id> | reject <id> | conflicts | stale | source <id> | rollback <id> --yes');
      }
    },
  },
{
    description: 'Inspect advanced memory graph facts',
    examples: ['/memory-graph graph', '/memory-graph related src/agent/loop.ts', '/memory-graph review'],
    name: '/memory-graph',
    usage: '/memory-graph graph|related|review|why [query]',
    async run(args, context) {
      const {formatMemoryGraphSummary, formatMemoryReview, formatRelatedMemories} = await import('../../memory/graphFormat.js');
      const {reviewMemoryGraph} = await import('../../memory/graph.js');
      const {searchMemoryGraph, explainMemorySelection} = await import('../../memory/graphSearch.js');
      const {MemoryGraphStore} = await import('../../memory/graphStore.js');
      const [subcommand, ...rest] = args;
      const graph = await new MemoryGraphStore(context.cwd).load();
      if (!subcommand || subcommand === 'graph') {
        context.appendLocalAssistantMessage(formatMemoryGraphSummary(graph));
        return;
      }
      if (subcommand === 'related') {
        context.appendLocalAssistantMessage(formatRelatedMemories(searchMemoryGraph(graph, rest.join(' '))));
        return;
      }
      if (subcommand === 'review') {
        context.appendLocalAssistantMessage(formatMemoryReview(reviewMemoryGraph(graph)));
        return;
      }
      if (subcommand === 'why') {
        context.appendLocalAssistantMessage(explainMemorySelection(searchMemoryGraph(graph, rest.join(' ') || context.cwd)));
        return;
      }
      context.appendLocalAssistantMessage('Usage: /memory-graph graph|related|review|why [query]');
    },
  },
];
