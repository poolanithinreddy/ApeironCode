/**
 * Executes a decomposed combined request (e.g. "list repo files and create a
 * calendar folder") as ordered deterministic sub-actions. Read-only parts run
 * without approval; mutating parts still require approval. One coherent answer
 * is produced. No provider call is made.
 */
import crypto from 'node:crypto';

import type {ApeironCodeConfig} from '../config/config.js';
import type {EventBus} from '../core/events/bus.js';
import {createEventTimestamp} from '../core/events/events.js';
import type {ApprovalManager} from '../safety/approvals.js';
import type {SessionStore} from '../sessions/store.js';
import type {ToolRegistry} from '../tools/registry.js';
import {emitMessage} from './loopHelpers.js';
import type {ConversationSession} from './session.js';
import type {DecomposedAction} from './requestDecomposition.js';
import type {SimpleAction} from './simpleActionRouter.js';
import {executeSimpleAction} from './simpleActionExecutor.js';
import type {AgentRunResult, AgentTaskState, ChatMessage} from './types.js';

const toSimpleAction = (action: DecomposedAction): SimpleAction => {
  switch (action.kind) {
    case 'inspect_repo':
      return {kind: 'project_tree', mutating: false, description: action.description};
    case 'read_file':
      return {kind: 'read_file', mutating: false, path: action.path, description: action.description};
    case 'create_folder':
      return {kind: 'create_folder', mutating: true, path: action.path, description: action.description};
    case 'create_file':
      return {kind: 'create_file', mutating: true, path: action.path, description: action.description};
    case 'run_tests':
      return {kind: 'run_tests', mutating: true, command: 'npm test', description: action.description};
    default:
      return {kind: 'project_tree', mutating: false, description: action.description};
  }
};

export const runCombinedRequest = async ({
  actions,
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
  actions: DecomposedAction[];
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
  const userMessage: ChatMessage = {
    content: prompt,
    createdAt: new Date().toISOString(),
    id: crypto.randomUUID(),
    role: 'user',
  };
  session.messages.push(userMessage);
  emitMessage(eventBus, userMessage);
  eventBus.emit({
    message: `Combined request: ${actions.map((a) => a.description).join(' + ')}`,
    timestamp: createEventTimestamp(),
    type: 'status.updated',
  });

  const sections: string[] = [];
  const filesChanged: string[] = [];
  const commandsRun: string[] = [];
  for (const action of actions) {
    const result = await executeSimpleAction(
      toSimpleAction(action),
      {approvalManager, config, cwd, eventBus, sessionId: session.id},
      toolRegistry,
    );
    for (const executed of result.tools) {
      session.toolCalls.push({
        createdAt: new Date().toISOString(),
        id: crypto.randomUUID(),
        input: executed.input,
        status: executed.ok ? 'success' : 'error',
        toolName: executed.toolName,
      });
    }
    filesChanged.push(...result.filesChanged);
    commandsRun.push(...result.commandsRun);
    const body = result.output ? `${result.summary}\n${result.output}` : result.summary;
    sections.push(`### ${action.description}\n${body}`);
  }
  taskState.filesChanged = filesChanged;
  taskState.commandsRun = commandsRun;

  const finalMessage: ChatMessage = {
    content: sections.join('\n\n'),
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
