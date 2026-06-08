import type {ConversationSession} from '../../agent/session.js';
import {SessionStore} from '../../sessions/store.js';
import {TaskStore} from '../../tasks/taskStore.js';

export const createBootstrapSessionStore = (): SessionStore => {
  return new SessionStore();
};

export const createBootstrapTaskStore = (cwd: string): TaskStore => {
  return new TaskStore(cwd);
};

export const loadBootstrapSession = async (
  sessionId: string | undefined,
  store = createBootstrapSessionStore(),
): Promise<ConversationSession | null> => {
  return sessionId ? store.load(sessionId) : null;
};
