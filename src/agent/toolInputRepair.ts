import type {ToolSchema} from '../tools/schema.js';

export interface ToolInputRepairResult {
  repaired: boolean;
  json: string;
  warnings: string[];
  unrecoverable: boolean;
}

export interface NormalizedToolInputResult {
  input: Record<string, unknown>;
  warnings: string[];
  valid: boolean;
  schemaErrors?: string[];
}

const debugDetailsEnabled = (): boolean =>
  /^(1|true|yes)$/iu.test(process.env.APEIRONCODE_DEBUG ?? '');

export const WRITE_FILE_REQUIRED_INPUT_ERROR =
  'write_file requires path and content. The model omitted required fields.';
export const READ_FILE_REQUIRED_INPUT_ERROR =
  'read_file requires a path. The model omitted the file path.';
export const TODO_WRITE_REQUIRED_INPUT_ERROR =
  'todo_write requires a todos array. The model omitted todo items.';

const tryParse = (text: string): {ok: true; value: unknown} | {ok: false} => {
  try {
    return {ok: true, value: JSON.parse(text) as unknown};
  } catch {
    return {ok: false};
  }
};

export function repairToolInputJson(raw: string): ToolInputRepairResult {
  const warnings: string[] = [];

  // Empty / whitespace / null-ish tool input is a valid "no arguments" call
  // (e.g. project_tree with no params). Normalize to {} once instead of
  // failing and looping on "invalid JSON".
  const trimmedRaw = (raw ?? '').trim();
  if (trimmedRaw === '' || /^(?:null|undefined|none|"")$/iu.test(trimmedRaw)) {
    return {
      repaired: true,
      json: '{}',
      warnings: ['Empty tool input normalized to {}.'],
      unrecoverable: false,
    };
  }

  // Try parse first
  const initial = tryParse(raw);

  if (initial.ok) {
    // Detect double-stringified: result is a string that itself is JSON object
    if (typeof initial.value === 'string') {
      const inner = tryParse(initial.value);
      if (inner.ok && inner.value && typeof inner.value === 'object' && !Array.isArray(inner.value)) {
        warnings.push('Input was double-stringified; unwrapped inner object.');
        return {repaired: true, json: initial.value, warnings, unrecoverable: false};
      }
    }
    // Detect wrapped payload {toolName, input: {...}} where caller produced an envelope
    if (
      initial.value
      && typeof initial.value === 'object'
      && !Array.isArray(initial.value)
    ) {
      const obj = initial.value as Record<string, unknown>;
      if (
        'input' in obj
        && obj.input
        && typeof obj.input === 'object'
        && !Array.isArray(obj.input)
        && ('toolName' in obj || 'name' in obj)
      ) {
        warnings.push('Unwrapped tool-call wrapper payload; used "input" field.');
        return {repaired: true, json: JSON.stringify(obj.input), warnings, unrecoverable: false};
      }
    }
    return {repaired: false, json: raw, warnings: [], unrecoverable: false};
  }

  let working = raw.trim();

  // 1. Remove trailing commas before } or ]
  working = working.replace(/,(\s*[}\]])/gu, '$1');

  const trailingAttempt = tryParse(working);
  if (trailingAttempt.ok) {
    warnings.push('Repaired trailing comma(s).');
    // After trailing comma repair, recheck wrapper/double-stringify
    if (typeof trailingAttempt.value === 'string') {
      const inner = tryParse(trailingAttempt.value);
      if (inner.ok && inner.value && typeof inner.value === 'object') {
        warnings.push('Input was double-stringified; unwrapped inner object.');
        return {repaired: true, json: trailingAttempt.value, warnings, unrecoverable: false};
      }
    }
    if (
      trailingAttempt.value
      && typeof trailingAttempt.value === 'object'
      && !Array.isArray(trailingAttempt.value)
    ) {
      const obj = trailingAttempt.value as Record<string, unknown>;
      if (
        'input' in obj
        && obj.input
        && typeof obj.input === 'object'
        && !Array.isArray(obj.input)
        && ('toolName' in obj || 'name' in obj)
      ) {
        warnings.push('Unwrapped tool-call wrapper payload; used "input" field.');
        return {repaired: true, json: JSON.stringify(obj.input), warnings, unrecoverable: false};
      }
    }
    return {repaired: true, json: working, warnings, unrecoverable: false};
  }

  return {repaired: false, json: raw, warnings, unrecoverable: true};
}

export function normalizeToolInput(
  toolName: string,
  input: unknown,
  schema?: ToolSchema,
): NormalizedToolInputResult {
  void schema;
  if (typeof input === 'string') {
    const repair = repairToolInputJson(input);
    if (repair.unrecoverable) {
      return {
        input: {},
        warnings: repair.warnings,
        valid: false,
        schemaErrors: [`Input for ${toolName} is not valid JSON`],
      };
    }
    try {
      const parsed = JSON.parse(repair.json) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {
          input: {},
          warnings: repair.warnings,
          valid: false,
          schemaErrors: ['Input must be a JSON object'],
        };
      }
      return {input: parsed as Record<string, unknown>, warnings: repair.warnings, valid: true};
    } catch {
      return {
        input: {},
        warnings: repair.warnings,
        valid: false,
        schemaErrors: ['Could not parse repaired JSON'],
      };
    }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {input: {}, warnings: [], valid: false, schemaErrors: ['Input must be an object']};
  }
  return {input: input as Record<string, unknown>, warnings: [], valid: true};
}

export function formatSchemaValidationFeedback(toolName: string, errors: string[]): string {
  if (toolName === 'write_file' && errors.some((error) => /\b(path|content)\b/iu.test(error))) {
    return debugDetailsEnabled()
      ? `${WRITE_FILE_REQUIRED_INPUT_ERROR}\nDetails:\n${errors.map((e) => `  - ${e}`).join('\n')}`
      : WRITE_FILE_REQUIRED_INPUT_ERROR;
  }
  return [
    `Tool call to "${toolName}" failed schema validation.`,
    'Errors:',
    ...errors.map((e) => `  - ${e}`),
    'Please correct the tool input and try again.',
  ].join('\n');
}

export function formatMissingRequiredToolInput(toolName: string, details?: string[]): string | null {
  if (toolName === 'write_file' && details?.some((error) => /\b(path|content)\b/iu.test(error))) {
    return formatWriteFileInputError(details);
  }
  if (toolName === 'read_file' && details?.some((error) => /\bpath\b/iu.test(error))) {
    return debugDetailsEnabled() && details.length > 0
      ? `${READ_FILE_REQUIRED_INPUT_ERROR}\nDetails:\n${details.map((detail) => `  - ${detail}`).join('\n')}`
      : READ_FILE_REQUIRED_INPUT_ERROR;
  }
  if (toolName === 'todo_write' && details?.some((error) => /\btodos\b/iu.test(error))) {
    return debugDetailsEnabled() && details.length > 0
      ? `${TODO_WRITE_REQUIRED_INPUT_ERROR}\nDetails:\n${details.map((detail) => `  - ${detail}`).join('\n')}`
      : TODO_WRITE_REQUIRED_INPUT_ERROR;
  }
  return null;
}

export function shouldRetryToolInput(error: unknown, attempts: number): boolean {
  if (isMissingRequiredToolInputError(error)) return false;
  if (attempts >= 3) return false;
  const msg = error instanceof Error ? error.message : String(error);
  return /JSON|schema|validation|parse/iu.test(msg);
}

export const isMissingWriteFileInput = (toolName: string, input: unknown): boolean => {
  if (toolName !== 'write_file' || !input || typeof input !== 'object' || Array.isArray(input)) return false;
  const obj = input as Record<string, unknown>;
  return typeof obj.path !== 'string' || obj.path.trim().length === 0 || typeof obj.content !== 'string';
};

export const isMissingRequiredToolInput = (toolName: string, input: unknown): boolean => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return ['write_file', 'read_file', 'todo_write'].includes(toolName);
  }
  const obj = input as Record<string, unknown>;
  if (toolName === 'write_file') return isMissingWriteFileInput(toolName, input);
  if (toolName === 'read_file') return typeof obj.path !== 'string' || obj.path.trim().length === 0;
  if (toolName === 'todo_write') return !Array.isArray(obj.todos);
  return false;
};

export const isMissingWriteFileInputError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(WRITE_FILE_REQUIRED_INPUT_ERROR);
};

const CONTRACT_REQUIRED_INPUT_RE =
  /\b[a-z_]+ requires (?:path|content|todos|command|search|replace)\b/iu;

export const isMissingRequiredToolInputError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(WRITE_FILE_REQUIRED_INPUT_ERROR) ||
    message.includes(READ_FILE_REQUIRED_INPUT_ERROR) ||
    message.includes(TODO_WRITE_REQUIRED_INPUT_ERROR) ||
    CONTRACT_REQUIRED_INPUT_RE.test(message);
};

export const formatWriteFileInputError = (details?: string[]): string =>
  debugDetailsEnabled() && details && details.length > 0
    ? `${WRITE_FILE_REQUIRED_INPUT_ERROR}\nDetails:\n${details.map((detail) => `  - ${detail}`).join('\n')}`
    : WRITE_FILE_REQUIRED_INPUT_ERROR;
