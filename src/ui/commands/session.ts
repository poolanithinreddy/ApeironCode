import type {SlashCommandDefinition} from './shared.js';
import {formatSlashMissingTaskMessage, resolveSlashTask} from './helpers.js';
import {parseCostArguments, parseHistoryArguments} from './parser.js';
import {formatCostBrowser, formatHistoryBrowser} from '../../history/browser.js';
import {queryEditHistory} from '../../tools/patch/editHistory.js';
import {buildContinuationPrompt} from '../../tasks/taskSummary.js';
import {TaskStore} from '../../tasks/taskStore.js';

export const createSessionCommands = (): SlashCommandDefinition[] => [
{
    description: 'Show current, project, all-session, or specific-session usage',
    name: '/cost',
    usage: '/cost [project|all|session <sessionId>]',
    async run(args, context) {
      const parsed = parseCostArguments(args);
      if ('error' in parsed) {
        context.appendLocalAssistantMessage(parsed.error);
        return;
      }

      if (parsed.scope === 'current') {
        const usage = context.agent.currentSession.tokenUsage;
        context.appendLocalAssistantMessage(
          usage?.totalTokens
            ? formatCostBrowser('current session', [context.agent.currentSession])
            : 'No usage data recorded for the current session yet.',
        );
        return;
      }

      const sessions = parsed.scope === 'all'
        ? await context.sessionStore.select({all: true})
        : parsed.scope === 'project'
          ? await context.sessionStore.select({projectPath: context.cwd})
          : await context.sessionStore.select({sessionId: parsed.sessionId});

      if (parsed.scope === 'session' && sessions.length === 0) {
        context.appendLocalAssistantMessage(`No session found for ${parsed.sessionId}.`);
        return;
      }

      const label = parsed.scope === 'all'
        ? 'all saved sessions'
        : parsed.scope === 'project'
          ? 'this project'
          : `session ${parsed.sessionId}`;
      context.setDashboard({
        label,
        sessions,
        title: 'Cost Browser',
        type: 'cost',
      });
      context.appendLocalAssistantMessage(formatCostBrowser(label, sessions));
    },
  },
{
    description: 'Browse recent sessions, usage, and edit history',
    name: '/history',
    usage: '/history [--all] [--file <path>] [--session <sessionId>] [--limit <count>]',
    async run(args, context) {
      const parsed = parseHistoryArguments(args);
      if ('error' in parsed) {
        context.appendLocalAssistantMessage(parsed.error);
        return;
      }

      const sessions = await context.sessionStore.select({
        all: parsed.all,
        projectPath: context.cwd,
        sessionId: parsed.session,
      });
      const edits = await queryEditHistory(context.cwd, {
        filePath: parsed.file,
        limit: parsed.limit,
        sessionId: parsed.session,
      });

      context.setDashboard({
        costLabel: parsed.session ? `session ${parsed.session}` : parsed.all ? 'all saved sessions' : 'this project',
        editLabel: parsed.file ? `file ${parsed.file}` : parsed.session ? `session ${parsed.session}` : 'this project',
        edits,
        includeProjectPath: Boolean(parsed.all),
        sessionLabel: parsed.session ? `session ${parsed.session}` : parsed.all ? 'all saved sessions' : 'saved sessions in this project',
        sessions: sessions.slice(0, parsed.limit),
        title: 'History Browser',
        type: 'history',
      });

      context.appendLocalAssistantMessage(formatHistoryBrowser({
        costLabel: parsed.session ? `session ${parsed.session}` : parsed.all ? 'all saved sessions' : 'this project',
        editLabel: parsed.file ? `file ${parsed.file}` : parsed.session ? `session ${parsed.session}` : 'this project',
        edits,
        includeProjectPath: Boolean(parsed.all),
        sessionLabel: parsed.session ? `session ${parsed.session}` : parsed.all ? 'all saved sessions' : 'saved sessions in this project',
        sessions: sessions.slice(0, parsed.limit),
      }));
    },
  },
{
    description: 'Continue a task plan by id, or the latest incomplete task plan',
    name: '/continue',
    usage: '/continue [taskId]',
    async run(args, context) {
      const taskStore = new TaskStore(context.cwd);
      const taskId = args.join(' ').trim() || undefined;
      const task = await resolveSlashTask(taskStore, taskId, 'latest-incomplete');
      if (!task) {
        context.appendLocalAssistantMessage(formatSlashMissingTaskMessage(taskId, true));
        return;
      }

      if (task.status === 'completed') {
        context.appendLocalAssistantMessage(`Task ${task.id} is already completed.`);
        return;
      }

      const taskToRun = task.status === 'running' ? task : (await taskStore.setStatus(task.id, 'running')) ?? task;

      if (taskToRun.linkedSessionId) {
        const session = await context.sessionStore.load(taskToRun.linkedSessionId);
        if (session) {
          context.agent.loadSession(session);
          context.refreshSessionState();
        }
      }

      context.agent.currentSession.taskPlanId = taskToRun.id;
      context.setStatus(`Continuing task ${taskToRun.id.slice(0, 8)}`);
      await context.runPrompt(buildContinuationPrompt(taskToRun), taskToRun.mode);
    },
  },
{
    description: 'Clear the in-memory conversation',
    name: '/clear',
    usage: '/clear',
    run(_args, context) {
      context.agent.clearConversation();
      context.setDashboard(null);
      context.refreshSessionState();
      context.setStatus('Conversation cleared');
    },
  },
{
    description: 'Scroll back to show earlier messages',
    examples: ['/show-more', '/show-more 5'],
    name: '/show-more',
    usage: '/show-more [count]',
    run(args, context) {
      const count = parseInt(args[0] ?? '5', 10);
      context.appendLocalAssistantMessage(`Scrolled back ${count} message(s). Earlier messages are now visible above. Use /show-last to jump to the newest messages.`);
    },
  },
{
    description: 'Jump to the most recent messages',
    examples: ['/show-last'],
    name: '/show-last',
    usage: '/show-last',
    run(_args, context) {
      context.appendLocalAssistantMessage('Jumped to the latest messages.');
    },
  },
{
    description: 'Compact the current session into a tighter summary',
    name: '/compact',
    usage: '/compact',
    run(_args, context) {
      const summary = context.agent.compactConversation();
      context.refreshSessionState();
      context.appendLocalAssistantMessage(summary);
    },
  },
{
    description: 'List sessions for this project',
    name: '/sessions',
    usage: '/sessions [query]',
    async run(args, context) {
      const query = args.join(' ').trim();
      const sessions = query
        ? await context.sessionStore.search(query, context.cwd)
        : await context.sessionStore.list(context.cwd);
      context.appendLocalAssistantMessage(
        sessions.length > 0
          ? sessions
              .map((session) => `${session.id} | ${session.title} | ${session.provider}/${session.model} | ${session.updatedAt}`)
              .join('\n')
          : 'No saved sessions found for this project.',
      );
    },
  },
{
    description: 'Resume a saved session',
    name: '/resume',
    usage: '/resume [session-id]',
    async run(args, context) {
      const sessionId = args.join(' ').trim();
      const session = sessionId
        ? await context.sessionStore.load(sessionId)
        : (await context.sessionStore.list(context.cwd))[0] ?? null;
      if (!session) {
        context.appendLocalAssistantMessage('No session found to resume.');
        return;
      }

      context.agent.loadSession(session);
      context.refreshSessionState();
      context.appendLocalAssistantMessage(`Resumed session ${session.id} (${session.title}).`);
    },
  },
{
    description: 'Exit the interactive app',
    name: '/exit',
    usage: '/exit',
    run(_args, context) {
      context.exit();
    },
  },
{
    description: 'Manage parallel agent sessions',
    examples: ['/session list', '/session start review auth', '/session show <id>', '/session attach <id>', '/session logs <id>', '/session stop <id>', '/session locks'],
    name: '/session',
    usage: '/session list | /session start <goal> | /session show <id> | /session attach <id> | /session logs <id> [--tail <count>] | /session pause <id> | /session resume <id> | /session stop <id> | /session delete <id> | /session locks',
    async run(args, context) {
      const {MultiAgentSessionManager} = await import('../../multisession/manager.js');
      const {formatSessionsList, formatSessionDetail, formatSessionSnapshot, formatFileLocks} = await import('../../multisession/format.js');

      const [subcommand, ...rest] = args;
      const manager = new MultiAgentSessionManager(context.cwd);

      if (!subcommand || subcommand === 'list') {
        const sessions = await manager.listSessions();
        context.appendLocalAssistantMessage(formatSessionsList(sessions));
        return;
      }

      if (subcommand === 'start') {
        const goal = rest.join(' ').trim();
        if (!goal) {
          context.appendLocalAssistantMessage('Usage: /session start <goal>\nExample: /session start review auth module');
          return;
        }

        const session = await manager.createSession({goal, mode: context.getCurrentMode()});
        const snapshot = await manager.getSnapshot(session.id);
        if (snapshot) {
          context.appendLocalAssistantMessage(`Created session:\n\n${formatSessionSnapshot(snapshot)}`);
        }
        return;
      }

      if (subcommand === 'show') {
        const sessionId = rest[0];
        if (!sessionId) {
          context.appendLocalAssistantMessage('Usage: /session show <sessionId>');
          return;
        }

        const session = await manager.getSession(sessionId);
        if (!session) {
          context.appendLocalAssistantMessage(`No session found for ${sessionId}`);
          return;
        }

        context.appendLocalAssistantMessage(formatSessionDetail(session));
        return;
      }

      if (subcommand === 'attach') {
        const sessionId = rest[0];
        if (!sessionId) {
          context.appendLocalAssistantMessage('Usage: /session attach <sessionId>');
          return;
        }

        const session = await manager.getSession(sessionId);
        if (!session) {
          context.appendLocalAssistantMessage(`No session found for ${sessionId}`);
          return;
        }

        const {BackgroundSessionRunner} = await import('../../multisession/background/index.js');
        const {formatRecentEventsForAttach} = await import('../../multisession/background/format.js');
        const runner = new BackgroundSessionRunner(context.cwd);

        let output = `## Session: ${session.goal}\n`;
        output += `**Status**: ${session.status}\n`;
        output += `**Mode**: ${session.mode ?? 'chat'}\n`;
        output += `**Model**: ${session.model ?? 'default'}\n`;
        output += `**Provider**: ${session.provider ?? 'default'}\n\n`;

        if (session.startedAt) {
          const startTime = new Date(session.startedAt);
          const endTime = session.completedAt ? new Date(session.completedAt) : new Date();
          const durationSec = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
          output += `**Duration**: ${durationSec}s\n\n`;
        }

        try {
          const events = await runner.getTailEvents(sessionId, 20);
          output += formatRecentEventsForAttach(events, 20);
        } catch {
          output += 'No event history available yet.';
        }

        if (session.status === 'running') {
          output += '\n\n*Note: Live interactive input is not supported. This is a read-only event stream.*';
          output += '\nUse `/session logs <id> --follow` to watch events as they arrive.';
        }

        context.appendLocalAssistantMessage(output);
        return;
      }

      if (subcommand === 'logs') {
        const sessionId = rest[0];
        if (!sessionId) {
          context.appendLocalAssistantMessage('Usage: /session logs <sessionId> [--tail <count>]');
          return;
        }

        const session = await manager.getSession(sessionId);
        if (!session) {
          context.appendLocalAssistantMessage(`No session found for ${sessionId}`);
          return;
        }

        const {BackgroundSessionRunner} = await import('../../multisession/background/index.js');
        const {formatEventLog} = await import('../../multisession/background/format.js');
        const runner = new BackgroundSessionRunner(context.cwd);

        // Parse --tail option
        let tailCount = 50;
        const tailIdx = rest.indexOf('--tail');
        if (tailIdx !== -1 && tailIdx + 1 < rest.length) {
          const tailValue = rest[tailIdx + 1];
          if (tailValue) {
            const parsed = parseInt(tailValue, 10);
            if (!isNaN(parsed) && parsed > 0) {
              tailCount = parsed;
            }
          }
        }

        try {
          const events = await runner.getTailEvents(sessionId, tailCount);
          const output = `## Event Log: ${session.goal}\n\n${formatEventLog(events)}`;
          context.appendLocalAssistantMessage(output);
        } catch {
          context.appendLocalAssistantMessage('Failed to read event log.');
        }
        return;
      }

      if (subcommand === 'pause') {
        const sessionId = rest[0];
        if (!sessionId) {
          context.appendLocalAssistantMessage('Usage: /session pause <sessionId>');
          return;
        }

        const session = await manager.pauseSession(sessionId);
        if (session) {
          context.appendLocalAssistantMessage(`Paused session ${sessionId.slice(0, 8)}`);
        } else {
          context.appendLocalAssistantMessage(`No session found for ${sessionId}`);
        }
        return;
      }

      if (subcommand === 'resume') {
        const sessionId = rest[0];
        if (!sessionId) {
          context.appendLocalAssistantMessage('Usage: /session resume <sessionId>');
          return;
        }

        const session = await manager.resumeSession(sessionId);
        if (session) {
          context.appendLocalAssistantMessage(`Resumed session ${sessionId.slice(0, 8)}`);
        } else {
          context.appendLocalAssistantMessage(`No session found for ${sessionId}`);
        }
        return;
      }

      if (subcommand === 'stop') {
        const sessionId = rest[0];
        if (!sessionId) {
          context.appendLocalAssistantMessage('Usage: /session stop <sessionId>');
          return;
        }

        const session = await manager.stopSession(sessionId);
        if (session) {
          context.appendLocalAssistantMessage(`Stopped session ${sessionId.slice(0, 8)}`);
        } else {
          context.appendLocalAssistantMessage(`No session found for ${sessionId}`);
        }
        return;
      }

      if (subcommand === 'delete') {
        const sessionId = rest[0];
        if (!sessionId) {
          context.appendLocalAssistantMessage('Usage: /session delete <sessionId>');
          return;
        }

        const deleted = await manager.deleteSession(sessionId);
        if (deleted) {
          context.appendLocalAssistantMessage(`Deleted session ${sessionId.slice(0, 8)}`);
        } else {
          context.appendLocalAssistantMessage(`No session found for ${sessionId}`);
        }
        return;
      }

      if (subcommand === 'locks') {
        const locks = await manager.listFileLocks();
        context.appendLocalAssistantMessage(formatFileLocks(locks));
        return;
      }

      context.appendLocalAssistantMessage('Unknown /session subcommand. Usage: /session list | /session start <goal> | /session show <id> | /session attach <id> | /session pause <id> | /session resume <id> | /session stop <id> | /session delete <id> | /session locks');
    },
  },
];
