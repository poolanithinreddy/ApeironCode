import type {ConversationSession} from '../agent/session.js';

export const serializeSession = (session: ConversationSession): string => {
  return `${JSON.stringify(session, null, 2)}\n`;
};