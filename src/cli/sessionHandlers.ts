import {MultiAgentSessionManager} from '../multisession/manager.js';
import {BackgroundSessionRunner, formatEventLog, formatRecentEventsForAttach} from '../multisession/background/index.js';
import {formatSessionDetail, formatSessionsList} from '../multisession/format.js';

/**
 * CLI handlers for session commands (Phase 7).
 * Implements: session start, session logs, session attach, session stop (background-aware)
 */

export async function startSession(
  goal: string,
  cwd: string,
  options?: {background?: boolean; mode?: string; provider?: string; model?: string},
): Promise<void> {
  const manager = new MultiAgentSessionManager(cwd);
  const session = await manager.createSession({
    goal,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-explicit-any
    mode: options?.mode as any,
    provider: options?.provider,
    model: options?.model,
  });

  console.log(`\nSession created: ${session.id.slice(0, 8)}`);
  console.log(`Goal: ${session.goal}`);
  console.log(`Status: ${session.status}`);

  if (options?.background) {
    console.log('\n⚠ Background mode is not yet implemented.');
    console.log('Session is queued locally. Use /session start <goal> in TUI to run interactively.');
    console.log(`\nQuick links:\n  /session show ${session.id.slice(0, 8)}\n  /session delete ${session.id.slice(0, 8)}`);
    return;
  }

  console.log('\nUse in TUI:\n  /session start ' + goal);
}

export async function listSessions(cwd: string): Promise<void> {
  const manager = new MultiAgentSessionManager(cwd);
  const sessions = await manager.listSessions();

  if (sessions.length === 0) {
    console.log('No sessions found.');
    return;
  }

  console.log(formatSessionsList(sessions));
}

export async function showSession(sessionId: string, cwd: string): Promise<void> {
  const manager = new MultiAgentSessionManager(cwd);
  const session = await manager.getSession(sessionId);

  if (!session) {
    console.error(`No session found for ${sessionId}`);
    process.exit(1);
  }

  console.log(formatSessionDetail(session));
}

export async function logsSession(sessionId: string, cwd: string, options?: {tail?: number; follow?: boolean}): Promise<void> {
  const manager = new MultiAgentSessionManager(cwd);
  const session = await manager.getSession(sessionId);

  if (!session) {
    console.error(`No session found for ${sessionId}`);
    process.exit(1);
  }

  const runner = new BackgroundSessionRunner(cwd);
  const tailCount = options?.tail ?? 50;

  if (options?.follow) {
    // Stream events with follow enabled
    const eventStream = runner.streamEvents(sessionId, {tail: tailCount, follow: true});
    for await (const event of eventStream) {
      // Format and print each event as it arrives
      const {formatEvent} = await import('../multisession/background/format.js');
      console.log(formatEvent(event));
    }
  } else {
    // Print tail events
    const events = await runner.getTailEvents(sessionId, tailCount);
    console.log(`## Event Log: ${session.goal}\n`);
    console.log(formatEventLog(events));
  }
}

export async function attachSession(sessionId: string, cwd: string): Promise<void> {
  const manager = new MultiAgentSessionManager(cwd);
  const session = await manager.getSession(sessionId);

  if (!session) {
    console.error(`No session found for ${sessionId}`);
    process.exit(1);
  }

  const runner = new BackgroundSessionRunner(cwd);

  let output = `# Session: ${session.goal}\n`;
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
    output += '\nUse `apeironcode session logs ' + sessionId.slice(0, 8) + ' --follow` to watch events.';
  }

  console.log(output);
}

export async function stopSession(sessionId: string, cwd: string): Promise<void> {
  const manager = new MultiAgentSessionManager(cwd);
  const runner = new BackgroundSessionRunner(cwd);

  const session = await manager.getSession(sessionId);
  if (!session) {
    console.error(`No session found for ${sessionId}`);
    process.exit(1);
  }

  const stopped = await runner.stopSession(sessionId);

  if (stopped) {
    console.log(`Session stopped: ${sessionId.slice(0, 8)}`);
  } else {
    console.error('Failed to stop session');
    process.exit(1);
  }
}
