import type {AgentRunOptions} from './types.js';
import type {ConversationSession} from './session.js';
import type {runAgentLoop} from './loop.js';

export const startMultiAgentSessionIfNeeded = async (
  cwd: string,
  options: Pick<AgentRunOptions, 'agentSessionId'>,
): Promise<void> => {
  if (!options.agentSessionId) {
    return;
  }

  const {MultiAgentSessionManager} = await import('../multisession/manager.js');
  const sessionManager = new MultiAgentSessionManager(cwd);
  const session = await sessionManager.getSession(options.agentSessionId);
  if (session && session.status === 'queued') {
    await sessionManager.startSession(options.agentSessionId);
  }
};

export const completeMultiAgentSessionIfNeeded = async ({
  cwd,
  result,
  session,
}: {
  cwd: string;
  result: Awaited<ReturnType<typeof runAgentLoop>>;
  session: ConversationSession;
}): Promise<void> => {
  if (!session.agentSessionId) {
    return;
  }

  const {MultiAgentSessionManager} = await import('../multisession/manager.js');
  const sessionManager = new MultiAgentSessionManager(cwd);
  const updates = {
    commandsRun: result.taskState?.commandsRun ?? [],
    filesChanged: result.taskState?.filesChanged ?? [],
    summary: result.finalMessage.content.slice(0, 500),
    testsRun: result.taskState?.testsRun ?? [],
  };
  await sessionManager.updateSession(session.agentSessionId, updates);
  if (result.taskState?.errors.length) {
    await sessionManager.failSession(session.agentSessionId, result.taskState.errors[0] ?? 'Unknown error');
  } else {
    await sessionManager.completeSession(session.agentSessionId, updates.summary);
  }
};

export const failMultiAgentSessionIfNeeded = async (
  cwd: string,
  session: ConversationSession,
  message: string,
): Promise<void> => {
  if (!session.agentSessionId) {
    return;
  }

  const {MultiAgentSessionManager} = await import('../multisession/manager.js');
  const sessionManager = new MultiAgentSessionManager(cwd);
  await sessionManager.failSession(session.agentSessionId, message);
};
