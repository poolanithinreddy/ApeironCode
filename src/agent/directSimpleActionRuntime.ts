import crypto from 'node:crypto';

import type {ApeironCodeConfig} from '../config/config.js';
import type {EventBus} from '../core/events/bus.js';
import {createEventTimestamp} from '../core/events/events.js';
import type {ApprovalManager} from '../safety/approvals.js';
import type {SessionStore} from '../sessions/store.js';
import type {ToolRegistry} from '../tools/registry.js';
import {emitMessage} from './loopHelpers.js';
import type {ConversationSession} from './session.js';
import type {AgentRunResult, AgentTaskState, ChatMessage} from './types.js';
import type {SimpleAction} from './simpleActionRouter.js';
import {formatSimpleActionPlan} from './simpleActionRouter.js';
import {
  executeSimpleAction,
  formatSimpleActionExecutionResult,
} from './simpleActionExecutor.js';

export const runDirectSimpleAction = async ({
  action,
  approvalManager,
  config,
  cwd,
  eventBus,
  prompt,
  session,
  sessionStore,
  taskState,
  toolRegistry,
  transcriptPath,
}: {
  action: SimpleAction;
  approvalManager: ApprovalManager;
  config: ApeironCodeConfig;
  cwd: string;
  eventBus: EventBus;
  prompt: string;
  session: ConversationSession;
  sessionStore: SessionStore;
  taskState: AgentTaskState;
  toolRegistry: ToolRegistry;
  transcriptPath: string;
}): Promise<AgentRunResult> => {
  eventBus.emit({
    message: formatSimpleActionPlan(action),
    timestamp: createEventTimestamp(),
    type: 'status.updated',
  });
  const userMessage: ChatMessage = {
    content: prompt,
    createdAt: new Date().toISOString(),
    id: crypto.randomUUID(),
    role: 'user',
  };
  session.messages.push(userMessage);
  emitMessage(eventBus, userMessage);

  const directResult = await executeSimpleAction(
    action,
    {approvalManager, config, cwd, eventBus, sessionId: session.id},
    toolRegistry,
  );
  for (const executed of directResult.tools) {
    session.toolCalls.push({
      createdAt: new Date().toISOString(),
      id: crypto.randomUUID(),
      input: executed.input,
      status: executed.ok ? 'success' : 'error',
      toolName: executed.toolName,
    });
    taskState.commandsRun = directResult.commandsRun;
    taskState.filesChanged = directResult.filesChanged;
  }

  const finalMessage: ChatMessage = {
    content: formatSimpleActionExecutionResult(directResult),
    createdAt: new Date().toISOString(),
    id: crypto.randomUUID(),
    role: 'assistant',
  };
  session.messages.push(finalMessage);
  session.transcriptPath = transcriptPath;
  session.updatedAt = new Date().toISOString();
  emitMessage(eventBus, finalMessage);
  await sessionStore.save(session).catch(() => undefined);
  return {finalMessage, messages: session.messages, taskState, toolCalls: session.toolCalls};
};
