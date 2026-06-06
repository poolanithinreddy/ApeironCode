import crypto from 'node:crypto';

import type {ResolvedConfig} from '../config/config.js';
import {recordToolCompletion, recordToolStart} from '../core/agent/state.js';
import {EventBus} from '../core/events/bus.js';
import {createEventTimestamp} from '../core/events/events.js';
import {TranscriptRecorder} from '../core/events/recorder.js';
import type {SessionStore} from '../sessions/store.js';
import {syncTaskPlanFromTaskState, syncTaskPlanFromToolCall} from '../tasks/taskPlanner.js';
import {TaskStore} from '../tasks/taskStore.js';
import type {ToolRegistry} from '../tools/registry.js';
import type {ToolResult} from '../tools/types.js';
import {getSessionTranscriptPath} from '../utils/paths.js';
import {bindAgentCallbacks} from './eventBridge.js';
import {createApprovalManager, configureToolExecutor, createToolOutputEmitter} from './runContext.js';
import type {ConversationSession} from './session.js';
import type {AgentCallbacks, ToolCallRecord, ChatMessage} from './types.js';
import type {ApprovalHandler} from '../safety/approvals.js';

export const invokeAgentTool = async ({
  approvalHandler,
  callbacks,
  config,
  cwd,
  eventBus = new EventBus(),
  session,
  sessionStore,
  toolName,
  input,
  toolRegistry,
}: {
  approvalHandler?: ApprovalHandler;
  callbacks?: AgentCallbacks;
  config: ResolvedConfig;
  cwd: string;
  eventBus?: EventBus;
  input: Record<string, unknown>;
  session: ConversationSession;
  sessionStore: SessionStore;
  toolName: string;
  toolRegistry: ToolRegistry;
}): Promise<{eventBus: EventBus; result: ToolResult}> => {
  const transcriptPath = getSessionTranscriptPath(session.id);
  const recorder = new TranscriptRecorder(session.id, transcriptPath);
  const approvalManager = createApprovalManager(config, approvalHandler, eventBus);
  configureToolExecutor({
    approvalManager,
    config,
    cwd,
    eventBus,
    sessionAgentSessionId: session.agentSessionId,
    sessionId: session.id,
    toolRegistry,
  });
  const removeCallbackBridge = bindAgentCallbacks(eventBus, callbacks);
  const removeRecorder = eventBus.subscribe((event) => {
    recorder.record(event);
  });
  const toolCall: ToolCallRecord = {
    createdAt: new Date().toISOString(),
    id: crypto.randomUUID(),
    input,
    status: 'running',
    toolName,
  };
  session.toolCalls.push(toolCall);
  if (session.taskState) {
    recordToolStart(session.taskState, toolCall);
  }
  eventBus.emit({
    timestamp: createEventTimestamp(),
    toolCall,
    type: 'tool.started',
  });

  try {
    const result = await toolRegistry.invoke(toolName, input, {
      approvalManager,
      config: config.effective,
      cwd,
      emitEvent: createToolOutputEmitter(eventBus),
      eventBus,
      sessionId: session.id,
      agentSessionId: session.agentSessionId,
      taskState: session.taskState,
    });

    toolCall.result = result;
    toolCall.status = 'success';
    if (session.taskState) {
      recordToolCompletion(session.taskState, toolCall);
    }
    if (session.taskPlanId) {
      const taskStore = new TaskStore(cwd);
      await taskStore.update(session.taskPlanId, (task) => {
        syncTaskPlanFromToolCall(task, toolCall);
        return syncTaskPlanFromTaskState(task, session.taskState);
      });
    }
    eventBus.emit({
      timestamp: createEventTimestamp(),
      toolCall,
      type: 'tool.completed',
    });

    const toolMessage: ChatMessage = {
      content: [
        `Tool result for ${toolName}:`,
        result.summary,
        result.output,
      ]
        .filter(Boolean)
        .join('\n\n'),
      createdAt: new Date().toISOString(),
      id: crypto.randomUUID(),
      role: 'tool',
    };
    session.messages.push(toolMessage);
    session.transcriptPath = transcriptPath;
    session.updatedAt = new Date().toISOString();
    await sessionStore.save(session).catch(() => undefined);
    eventBus.emit({
      messageId: toolMessage.id,
      role: toolMessage.role,
      timestamp: createEventTimestamp(),
      type: 'message.started',
    });
    eventBus.emit({
      message: toolMessage,
      timestamp: createEventTimestamp(),
      type: 'message.completed',
    });
    eventBus.emit({
      sessionId: session.id,
      timestamp: createEventTimestamp(),
      transcriptPath,
      type: 'session.saved',
    });

    return {eventBus, result};
  } catch (error) {
    toolCall.error = error instanceof Error ? error.message : String(error);
    toolCall.status = 'error';
    if (session.taskState) {
      recordToolCompletion(session.taskState, toolCall);
    }
    if (session.taskPlanId) {
      const taskStore = new TaskStore(cwd);
      await taskStore.update(session.taskPlanId, (task) => {
        syncTaskPlanFromToolCall(task, toolCall);
        task.status = 'failed';
        return syncTaskPlanFromTaskState(task, session.taskState);
      });
    }
    eventBus.emit({
      timestamp: createEventTimestamp(),
      toolCall,
      type: 'tool.failed',
    });
    eventBus.emit({
      message: toolCall.error,
      scope: toolName,
      timestamp: createEventTimestamp(),
      type: 'error',
    });
    throw error;
  } finally {
    await recorder.save();
    removeRecorder();
    removeCallbackBridge();
  }
};
