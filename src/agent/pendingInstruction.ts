/**
 * Multi-turn pending instruction handling.
 *
 * Some users open a change request without details:
 *   "do the following changes in the web app"
 * and only then send the actual numbered/bulleted items:
 *   "1. Make the UI premium with a true black/dark background by default."
 *
 * The runtime must NOT run broken tools on the first message. It should wait,
 * remember the pending task in session memory (never project memory), and
 * merge the next concrete instruction with it before running the workflow.
 */
import crypto from 'node:crypto';
import type {SessionStore} from '../sessions/store.js';
import type {ConversationSession} from './session.js';
import type {AgentRunResult, AgentTaskState, ChatMessage} from './types.js';

export interface PendingInstruction {
  task: string;
  createdAt: string;
}

const INCOMPLETE_SETUP_RE =
  /\b(do the following changes?|make these changes?|apply (?:these|the following) changes?|update the (?:app|project|code) with the following|here (?:are|is) (?:the )?(?:changes|instructions)|i (?:will|'ll) (?:give|list|send) (?:you )?(?:the )?(?:changes|details|instructions))\b/iu;

const ACTION_VERB_RE =
  /\b(make|add|change|update|set|fix|build|remove|delete|create|use|replace|implement|rename|move|refactor|improve|convert|turn|style|design)\b/iu;

/** Does the prompt itself already contain concrete actionable detail? */
const hasConcreteDetail = (prompt: string): boolean => {
  if (/(^|\n)\s*(?:\d+[.)]|[-*])\s+\S/u.test(prompt)) return true;
  // Concrete only when an action verb appears beyond the bare setup phrase
  // ("... in the web app" is NOT actionable detail).
  const stripped = prompt.replace(INCOMPLETE_SETUP_RE, '').trim();
  return ACTION_VERB_RE.test(stripped);
};

/**
 * True when the prompt asks for upcoming changes but supplies no details yet.
 * The runtime should acknowledge and wait, without calling any tool/provider.
 */
export const detectIncompleteSetupPhrase = (prompt: string): boolean => {
  const text = prompt.trim();
  if (!INCOMPLETE_SETUP_RE.test(text)) return false;
  return !hasConcreteDetail(text);
};

/**
 * True when a prompt looks like a continuation of an earlier pending task
 * (numbered / bulleted item, or a short imperative follow-up).
 */
export const isContinuationInstruction = (prompt: string): boolean => {
  const text = prompt.trim();
  if (/^\s*(?:\d+[.)]|[-*])\s+\S/u.test(text)) return true;
  if (/^(also|and|then|next|additionally)\b/iu.test(text)) return true;
  return false;
};

export const createPendingInstruction = (task: string): PendingInstruction => ({
  task: task.trim(),
  createdAt: new Date().toISOString(),
});

/**
 * Merge a pending setup task with the concrete follow-up instruction.
 * Prefixed with an explicit "Modify the existing app" directive so the
 * coding-intent classifier routes it through the deterministic file-plan
 * flow (read existing files → plan → approve → write).
 */
export const mergePendingInstruction = (
  pending: PendingInstruction,
  next: string,
): string =>
  `Modify the existing app. ${pending.task.trim()}\n${next.trim()}`;

export const ASK_FOR_DETAILS_MESSAGE =
  'Got it — I will apply changes to the web app. Please list the specific changes ' +
  '(numbered or bulleted) and I will read the relevant files and produce a plan. ' +
  'No files were changed and no tools were run yet.';

/**
 * Resolve the pending-instruction lifecycle for an incoming prompt. Either:
 *  - merges a continuation with a stored pending task and returns the merged
 *    prompt for downstream routing, or
 *  - records a new pending task, persists the session, and returns a
 *    short-circuit AgentRunResult (no tools, no provider).
 */
export interface PendingInstructionResolution {
  shortCircuit: true;
  result: AgentRunResult;
}
export interface PendingInstructionContinuation {
  shortCircuit: false;
  mergedPrompt?: string;
}

export const resolvePendingInstruction = async (params: {
  prompt: string;
  session: ConversationSession;
  sessionStore: SessionStore;
  skillName?: string;
  taskState: AgentTaskState;
}): Promise<PendingInstructionResolution | PendingInstructionContinuation> => {
  const {prompt, session, sessionStore, skillName, taskState} = params;
  if (session.pendingInstruction && isContinuationInstruction(prompt)) {
    const merged = mergePendingInstruction(session.pendingInstruction, prompt);
    session.pendingInstruction = undefined;
    return {shortCircuit: false, mergedPrompt: merged};
  }
  if (!detectIncompleteSetupPhrase(prompt) || skillName) {
    return {shortCircuit: false};
  }
  session.pendingInstruction = createPendingInstruction(prompt);
  const userMessage: ChatMessage = {
    content: prompt,
    createdAt: new Date().toISOString(),
    id: crypto.randomUUID(),
    role: 'user',
  };
  const finalMessage: ChatMessage = {
    content: ASK_FOR_DETAILS_MESSAGE,
    createdAt: new Date().toISOString(),
    id: crypto.randomUUID(),
    role: 'assistant',
  };
  session.messages.push(userMessage, finalMessage);
  session.updatedAt = new Date().toISOString();
  await sessionStore.save(session).catch(() => undefined);
  return {
    shortCircuit: true,
    result: {
      finalMessage,
      messages: session.messages,
      taskState,
      toolCalls: session.toolCalls,
    },
  };
};
