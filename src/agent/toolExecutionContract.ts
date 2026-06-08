/**
 * Central tool execution contract.
 *
 * Every agent-callable tool must pass through this layer before execution so
 * that undefined / malformed arguments never reach a tool, and so that a
 * failure for one tool can never surface another tool's error message
 * (the Phase 17A root cause: a read_file failure reporting
 * "write_file requires path and content").
 */

const debugDetailsEnabled = (): boolean =>
  /^(1|true|yes)$/iu.test(process.env.APEIRONCODE_DEBUG ?? '');

interface RequiredField {
  field: string;
  kind: 'string' | 'array';
  /** When true, an empty string still satisfies the field (e.g. file content). */
  allowEmpty?: boolean;
}

const REQUIRED_FIELDS: Record<string, RequiredField[]> = {
  read_file: [{field: 'path', kind: 'string'}],
  write_file: [
    {field: 'path', kind: 'string'},
    {field: 'content', kind: 'string', allowEmpty: true},
  ],
  edit_file: [
    {field: 'path', kind: 'string'},
    {field: 'search', kind: 'string'},
    {field: 'replace', kind: 'string', allowEmpty: true},
  ],
  run_command: [{field: 'command', kind: 'string'}],
  todo_write: [{field: 'todos', kind: 'array'}],
};

/** Tools where a missing/empty argument object is a valid "no arguments" call. */
const NO_ARG_TOOLS = new Set(['project_tree']);

export interface ToolInputValidationError {
  toolName: string;
  missing: string[];
  /** Concise, always tool-specific message. Never references another tool. */
  message: string;
  retryable: boolean;
}

const conciseMessage = (toolName: string, missing: string[]): string => {
  switch (toolName) {
    case 'read_file':
      return 'read_file requires path';
    case 'write_file':
      return 'write_file requires path and content';
    case 'todo_write':
      return 'todo_write requires todos';
    case 'edit_file':
      return 'edit_file requires path, search and replace';
    case 'run_command':
      return 'run_command requires command';
    default:
      return `${toolName} requires ${missing.join(', ')}`;
  }
};

/**
 * Normalize a raw tool input into an object. Strings are JSON-parsed; empty /
 * null-ish input becomes `{}` (valid for no-arg tools like project_tree).
 */
export function normalizeToolCall(
  _toolName: string,
  rawInput: unknown,
): {input: Record<string, unknown>; parseFailed: boolean} {
  if (rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)) {
    return {input: rawInput as Record<string, unknown>, parseFailed: false};
  }
  if (typeof rawInput === 'string') {
    const trimmed = rawInput.trim();
    if (trimmed === '' || /^(?:null|undefined|none|"")$/iu.test(trimmed)) {
      return {input: {}, parseFailed: false};
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return {input: parsed as Record<string, unknown>, parseFailed: false};
      }
      return {input: {}, parseFailed: true};
    } catch {
      return {input: {}, parseFailed: true};
    }
  }
  if (rawInput === null || rawInput === undefined) {
    return {input: {}, parseFailed: false};
  }
  return {input: {}, parseFailed: true};
}

/**
 * Validate a normalized tool input against the tool's required-field contract.
 * Returns null when the input is acceptable.
 */
export function validateToolInput(
  toolName: string,
  input: Record<string, unknown>,
  /**
   * Fields the tool's registered schema actually requires. When provided, the
   * name-based contract only enforces the intersection so a tool whose real
   * schema accepts `{}` is never falsely rejected.
   */
  schemaRequired?: readonly string[],
): ToolInputValidationError | null {
  const spec = REQUIRED_FIELDS[toolName];
  if (!spec) {
    if (NO_ARG_TOOLS.has(toolName)) return null;
    return null;
  }
  const effectiveSpec = schemaRequired
    ? spec.filter((s) => schemaRequired.includes(s.field))
    : spec;
  if (effectiveSpec.length === 0) return null;
  const missing: string[] = [];
  for (const {field, kind, allowEmpty} of effectiveSpec) {
    const value = input[field];
    if (kind === 'string') {
      if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) {
        missing.push(field);
      }
    } else if (!Array.isArray(value)) {
      missing.push(field);
    }
  }
  if (missing.length === 0) return null;
  return {
    toolName,
    missing,
    message: conciseMessage(toolName, missing),
    retryable: false,
  };
}

/** Format a tool-input error for display. Debug mode appends details. */
export function formatToolInputError(
  error: ToolInputValidationError,
  mode: 'normal' | 'debug' = debugDetailsEnabled() ? 'debug' : 'normal',
): string {
  if (mode === 'debug') {
    return `${error.message}\nMissing fields: ${error.missing.join(', ')}`;
  }
  return error.message;
}

/**
 * Missing-required-field errors must never be retried with the identical
 * malformed call. Transient JSON/schema parse noise may retry once.
 */
export function shouldRetryToolInputError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'retryable' in error) {
    return Boolean((error as ToolInputValidationError).retryable);
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/\brequires\b/u.test(message)) return false;
  return /JSON|parse/iu.test(message);
}

export const isToolInputContractError = (error: unknown): error is ToolInputValidationError =>
  Boolean(
    error &&
      typeof error === 'object' &&
      'toolName' in error &&
      'missing' in error &&
      'message' in error,
  );
