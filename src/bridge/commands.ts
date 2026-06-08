/**
 * ApeironCode Bridge — Session command routing and validation.
 * Routes session.start / session.send_prompt / session.stop.
 * No provider calls here — delegates to injected runner.
 */

import type {BridgeMessage} from './types.js';
import {createBridgeMessage, createBridgeErrorMessage} from './types.js';
import {redactBridgePayload} from './redaction.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_PROMPT_CHARS = 32_000;
const MAX_SELECTED_TEXT_CHARS = 8_000;
const MAX_FILE_PATH_CHARS = 500;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BridgeSelectedContext {
  filePath: string;
  workspaceRelativePath?: string;
  languageId?: string;
  selectedText?: string;
  lineStart?: number;
  lineEnd?: number;
}

export interface BridgeSendPromptRequest {
  sessionId?: string;
  prompt: string;
  cwd: string;
  selectedContext?: BridgeSelectedContext;
  mode?: string;
  requestId?: string;
  /** Optional provider override (catalog id). */
  providerName?: string;
  /** Optional model id override. */
  model?: string;
}

export interface BridgeSessionStartRequest {
  cwd: string;
  requestId?: string;
}

export interface BridgeSessionStopRequest {
  sessionId: string;
  requestId?: string;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export type CommandValidationError = {ok: false; code: string; message: string};
export type CommandValidationOk<T> = {ok: true; value: T};
export type CommandValidation<T> = CommandValidationError | CommandValidationOk<T>;

const fail = (code: string, message: string): CommandValidationError => ({ok: false, code, message});
const ok = <T>(value: T): CommandValidationOk<T> => ({ok: true, value});

const sanitizeSelectedContext = (raw: unknown): BridgeSelectedContext | undefined => {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const filePath = typeof r['filePath'] === 'string' ? r['filePath'].slice(0, MAX_FILE_PATH_CHARS) : '';
  if (!filePath) return undefined;

  let selectedText: string | undefined;
  if (typeof r['selectedText'] === 'string') {
    const raw = r['selectedText'].slice(0, MAX_SELECTED_TEXT_CHARS);
    selectedText = redactBridgePayload(raw) as string;
  }

  return {
    filePath,
    workspaceRelativePath: typeof r['workspaceRelativePath'] === 'string'
      ? r['workspaceRelativePath'].slice(0, MAX_FILE_PATH_CHARS)
      : undefined,
    languageId: typeof r['languageId'] === 'string'
      ? r['languageId'].slice(0, 50)
      : undefined,
    selectedText,
    lineStart: typeof r['lineStart'] === 'number' ? r['lineStart'] : undefined,
    lineEnd: typeof r['lineEnd'] === 'number' ? r['lineEnd'] : undefined,
  };
};

export const validateSendPromptPayload = (
  payload: Record<string, unknown>,
): CommandValidation<BridgeSendPromptRequest> => {
  const rawPrompt = payload['prompt'];
  if (typeof rawPrompt !== 'string' || rawPrompt.trim().length === 0) {
    return fail('INVALID_PROMPT', 'Prompt must be a non-empty string');
  }
  if (rawPrompt.length > MAX_PROMPT_CHARS) {
    return fail('PROMPT_TOO_LARGE', `Prompt exceeds ${MAX_PROMPT_CHARS} character limit`);
  }

  const cwd = typeof payload['cwd'] === 'string' && payload['cwd'].length > 0
    ? payload['cwd']
    : process.cwd();

  const prompt = redactBridgePayload(rawPrompt) as string;
  const sessionId = typeof payload['sessionId'] === 'string' ? payload['sessionId'] : undefined;
  const mode = typeof payload['mode'] === 'string' ? payload['mode'].slice(0, 50) : undefined;
  const requestId = typeof payload['requestId'] === 'string' ? payload['requestId'] : undefined;
  const selectedContext = sanitizeSelectedContext(payload['selectedContext']);
  const providerName = typeof payload['providerName'] === 'string'
    ? payload['providerName'].slice(0, 80)
    : undefined;
  const model = typeof payload['model'] === 'string' ? payload['model'].slice(0, 120) : undefined;

  return ok({prompt, cwd, sessionId, mode, selectedContext, requestId, providerName, model});
};

export const validateSessionStartPayload = (
  payload: Record<string, unknown>,
): CommandValidation<BridgeSessionStartRequest> => {
  const cwd = typeof payload['cwd'] === 'string' && payload['cwd'].length > 0
    ? payload['cwd']
    : process.cwd();
  const requestId = typeof payload['requestId'] === 'string' ? payload['requestId'] : undefined;
  return ok({cwd, requestId});
};

export const validateSessionStopPayload = (
  payload: Record<string, unknown>,
): CommandValidation<BridgeSessionStopRequest> => {
  const sessionId = typeof payload['sessionId'] === 'string' ? payload['sessionId'] : '';
  if (!sessionId) return fail('MISSING_SESSION_ID', 'sessionId required to stop session');
  const requestId = typeof payload['requestId'] === 'string' ? payload['requestId'] : undefined;
  return ok({sessionId, requestId});
};

// ─── Error formatting ─────────────────────────────────────────────────────────

export const formatBridgeCommandError = (
  code: string,
  message: string,
  requestId?: string,
): BridgeMessage => {
  const safeMessage = redactBridgePayload(message.slice(0, 400)) as string;
  return createBridgeErrorMessage(code, safeMessage, requestId);
};

// ─── Context formatting for prompt ──────────────────────────────────────────

/**
 * Formats selected context as a safe prompt prefix.
 * No raw secrets (already redacted by sanitizeSelectedContext).
 */
export const formatSelectedContextForPrompt = (ctx: BridgeSelectedContext): string => {
  const path = ctx.workspaceRelativePath ?? ctx.filePath;
  const lang = ctx.languageId ? ` (${ctx.languageId})` : '';
  const lines = ctx.lineStart !== undefined && ctx.lineEnd !== undefined
    ? ` lines ${ctx.lineStart}–${ctx.lineEnd}`
    : '';
  const header = `[Context: ${path}${lang}${lines}]`;
  if (ctx.selectedText) {
    return `${header}\n\`\`\`\n${ctx.selectedText}\n\`\`\`\n\n`;
  }
  return `${header}\n\n`;
};

/**
 * Builds the full prompt with optional selected context prepended.
 */
export const buildPromptWithContext = (
  prompt: string,
  selectedContext?: BridgeSelectedContext,
): string => {
  if (!selectedContext) return prompt;
  return formatSelectedContextForPrompt(selectedContext) + prompt;
};

// ─── Safe session state ──────────────────────────────────────────────────────

export interface SafeSessionState {
  sessionId: string;
  status: string;
  promptCount: number;
  lastActivity: string;
}

export const makeSafeSessionState = (
  sessionId: string,
  status: string,
  promptCount: number,
): SafeSessionState => ({
  sessionId,
  status,
  promptCount,
  lastActivity: new Date().toISOString(),
});

export const createSessionStartedMessage = (
  sessionId: string,
  requestId?: string,
): BridgeMessage =>
  createBridgeMessage('session.created', {sessionId, status: 'active'}, {requestId});

export const createSessionBusyMessage = (
  sessionId: string,
  requestId?: string,
): BridgeMessage =>
  createBridgeMessage('session.busy', {sessionId, message: 'Session is processing a prompt'}, {requestId});
