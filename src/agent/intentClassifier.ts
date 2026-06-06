import type {RiskLevel} from '../safety/policy.js';
import {
  type RuntimeAction,
  type RuntimePermissionContext,
  classifyRuntimeActionRisk,
  requiresRuntimeApproval,
} from './runtimePermissions.js';

const GREETING_RE = /^(hi|hey|hello|yo|sup|hiya|howdy|good (?:morning|afternoon|evening)|thanks?|thank you|ok(?:ay)?|cool|nice|great)\b[\s!.?]*$/iu;

const PURE_CHAT_RE = /^\s*(who are you|what can you do|what are you|help|how do you work|what is apeironcode|tell me about yourself)\b/iu;

const READONLY_PLANNING_RE = /\b(explain|describe|summari[sz]e|overview|walk me through|architecture|how does|what does|outline|plan|design|brainstorm|suggest|recommend|compare|analyze|review|understand|what is|where is|why does)\b/iu;

const WRITE_INTENT_RE = /\b(edit|modify|change|update|fix|refactor|rename|delete|remove|create|add|implement|write|install|run|execute|commit|push|merge|rebase|deploy|generate|build|apply|patch)\b/iu;

/**
 * True when the prompt is plain conversation (greeting / capability question)
 * that needs no tools and therefore must never trigger an approval prompt.
 */
export const isPureChatIntent = (prompt: string): boolean => {
  const trimmed = prompt.trim();
  if (trimmed.length === 0) return true;
  if (GREETING_RE.test(trimmed)) return true;
  if (PURE_CHAT_RE.test(trimmed)) return true;
  return false;
};

/**
 * True when the prompt asks for explanation/planning/analysis only and does
 * not request a mutating action. Such prompts may read files but must not
 * trigger plan-approval or write/shell approval on their own.
 */
export const isReadOnlyPlanningIntent = (prompt: string): boolean => {
  const trimmed = prompt.trim();
  if (trimmed.length === 0) return false;
  if (WRITE_INTENT_RE.test(trimmed)) return false;
  return READONLY_PLANNING_RE.test(trimmed);
};

export interface AgentActionApproval {
  required: boolean;
  reason: string;
  risk: RiskLevel;
}

/**
 * Single source of truth for whether a concrete agent action (a resolved
 * tool/runtime action, not a raw user prompt) requires approval. Pure chat
 * and read-only planning never reach here because they produce no action.
 */
export const shouldRequireApprovalForAgentAction = (
  action: RuntimeAction,
  context: RuntimePermissionContext = {},
): AgentActionApproval => {
  const risk = classifyRuntimeActionRisk(action);
  const required = requiresRuntimeApproval(action, context);
  let reason: string;
  if (!required) {
    reason = action.kind === 'read_file'
      ? 'Read-only access — allowed without approval.'
      : 'Action allowed by current permission mode.';
  } else if (action.kind === 'delete_or_move') {
    reason = `Deleting or moving ${action.path ?? 'a path'} is destructive and needs confirmation.`;
  } else if (action.kind === 'run_command') {
    reason = `Running a shell command (${action.command ?? 'unknown'}) can change your system.`;
  } else if (action.kind === 'write_file' || action.kind === 'edit_file') {
    reason = `Writing to ${action.path ?? 'a file'} modifies your workspace.`;
  } else if (action.kind.endsWith('_write')) {
    reason = `This ${action.kind.replace('_', ' ')} action has external side effects.`;
  } else {
    reason = 'This action requires approval under the current policy.';
  }
  return {required, reason, risk};
};
