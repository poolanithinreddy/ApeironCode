import type {ConversationSession} from '../agent/session.js';

export const searchSessions = (
  sessions: ConversationSession[],
  query: string,
): ConversationSession[] => {
  const lowerQuery = query.trim().toLowerCase();
  if (!lowerQuery) {
    return sessions;
  }

  return sessions.filter((session) => {
    const haystack = [
      session.id,
      session.title,
      session.lastGoal,
      session.projectPath,
      session.provider,
      session.model,
      session.sessionMemory?.summary,
      session.sessionMemory?.finalResult,
      session.sessionMemory?.decisionsMade.join(' '),
      session.sessionMemory?.failedAttempts.join(' '),
      session.sessionMemory?.followUpTasks?.join(' '),
      session.sessionMemory?.memorySuggestions?.map((suggestion) => suggestion.summary).join(' '),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(lowerQuery);
  });
};