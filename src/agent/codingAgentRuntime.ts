import {createEventTimestamp} from '../core/events/events.js';
import type {EventBus} from '../core/events/bus.js';
import type {ModelProvider} from '../providers/types.js';
import type {ApprovalManager} from '../safety/approvals.js';
import type {SessionStore} from '../sessions/store.js';
import type {ToolRegistry} from '../tools/registry.js';
import type {ApeironCodeConfig} from '../config/config.js';
import {classifyCodingIntent, isAutonomousCodingIntent} from './codingIntent.js';
import {runCodingTask} from './codingOrchestrator.js';
import type {EffectiveModeReason} from './effectiveMode.js';
import {deriveSessionTitle, type ConversationSession} from './session.js';
import type {AgentMode, AgentRunResult, AgentTaskState} from './types.js';

export const shouldRunAutonomousCoding = (
  prompt: string,
  options: {planOnly?: boolean; skillName?: string; mode: AgentMode; workspaceHasAppFiles?: boolean},
): boolean => {
  if (/^You are the \w+ subagent in an ApeironCode sequential team run\./u.test(prompt)) {
    return false;
  }
  const intent = classifyCodingIntent(prompt, '', {
    workspaceHasAppFiles: options.workspaceHasAppFiles,
  });
  return isAutonomousCodingIntent(intent) &&
    !options.planOnly &&
    !options.skillName &&
    options.mode !== 'test-fix';
};

export async function runAutonomousCodingSession({
  approvalManager,
  config,
  cwd,
  eventBus,
  model,
  provider,
  prompt,
  session,
  sessionStore,
  signal,
  taskState,
  toolRegistry,
  transcriptPath,
  mode,
  modeReason,
  providerName,
}: {
  approvalManager: ApprovalManager;
  config: ApeironCodeConfig;
  cwd: string;
  eventBus: EventBus;
  mode: AgentMode;
  modeReason?: EffectiveModeReason;
  model: string;
  provider: ModelProvider;
  providerName: string;
  prompt: string;
  session: ConversationSession;
  sessionStore: SessionStore;
  signal?: AbortSignal;
  taskState: AgentTaskState;
  toolRegistry: ToolRegistry;
  transcriptPath: string;
}): Promise<AgentRunResult> {
  const result = await runCodingTask(prompt, {
    approvalManager,
    config,
    cwd,
    eventBus,
    initialMessages: session.messages,
    model,
    provider,
    sessionId: session.id,
    signal,
    taskState,
    toolRegistry,
  });
  session.lastGoal = prompt;
  session.messages = result.messages;
  session.model = model;
  session.mode = mode;
  session.modeReason = modeReason;
  session.provider = providerName;
  session.taskState = result.taskState;
  session.title = deriveSessionTitle(prompt);
  session.toolCalls = result.toolCalls;
  session.transcriptPath = transcriptPath;
  session.updatedAt = new Date().toISOString();
  await sessionStore.save(session).catch(() => undefined);
  eventBus.emit({
    sessionId: session.id,
    timestamp: createEventTimestamp(),
    transcriptPath,
    type: 'session.saved',
  });
  return result;
}
