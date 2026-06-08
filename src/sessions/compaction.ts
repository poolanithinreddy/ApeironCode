import type {ChatMessage, ToolCallRecord, AgentTaskState} from '../agent/types.js';

export interface SessionCompactionResult {
  retainedMessages: ChatMessage[];
  summary: string;
}

export const compactSession = ({
  messages,
  taskState,
  toolCalls,
}: {
  messages: ChatMessage[];
  taskState?: AgentTaskState;
  toolCalls: ToolCallRecord[];
}): SessionCompactionResult => {
  const recentMessages = messages.slice(-4);
  const recentTools = toolCalls.slice(-4).map((toolCall) => {
    const status = toolCall.result?.summary ?? toolCall.error ?? toolCall.status;
    return `- ${toolCall.toolName}: ${status}`;
  });
  const summary = [
    'Compacted session summary:',
    taskState ? `Goal: ${taskState.goal}` : null,
    taskState ? `Mode: ${taskState.mode}` : null,
    taskState && taskState.plan.length > 0 ? `Plan: ${taskState.plan.join(' | ')}` : null,
    taskState && taskState.filesChanged.length > 0 ? `Files changed: ${taskState.filesChanged.join(', ')}` : null,
    taskState && taskState.testsRun.length > 0 ? `Tests run: ${taskState.testsRun.join(', ')}` : null,
    recentTools.length > 0 ? 'Recent tool activity:' : null,
    ...recentTools,
    'Recent messages:',
    ...(recentMessages.length > 0
      ? recentMessages.map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      : ['No prior conversation history.']),
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    retainedMessages: recentMessages,
    summary,
  };
};