import {logger} from '../utils/logger.js';

export interface OpenAICompatibleFunctionTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required: string[];
      [key: string]: unknown;
    };
  };
}

export interface ToolSchemaSanitizerWarning {
  toolName?: string;
  reason: 'invalid_shape' | 'invalid_name' | 'non_object_parameters';
}

const VALID_TOOL_NAME_RE = /^[a-zA-Z0-9_.-]{1,64}$/u;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const safeToolName = (value: unknown): string | undefined =>
  typeof value === 'string' && VALID_TOOL_NAME_RE.test(value) ? value : undefined;

export const validateOpenAICompatibleTool = (
  tool: unknown,
): tool is OpenAICompatibleFunctionTool => {
  if (!isPlainObject(tool) || tool.type !== 'function') return false;
  const fn = isPlainObject(tool.function) ? tool.function : undefined;
  if (!fn || !safeToolName(fn.name)) return false;
  const parameters = isPlainObject(fn.parameters) ? fn.parameters : undefined;
  return (
    parameters?.type === 'object' &&
    isPlainObject(parameters.properties) &&
    Array.isArray(parameters.required)
  );
};

export const sanitizeOpenAICompatibleToolsWithWarnings = (
  tools: unknown[],
): {tools: OpenAICompatibleFunctionTool[]; warnings: ToolSchemaSanitizerWarning[]} => {
  const sanitized: OpenAICompatibleFunctionTool[] = [];
  const warnings: ToolSchemaSanitizerWarning[] = [];

  for (const raw of tools) {
    if (!isPlainObject(raw) || !isPlainObject(raw.function)) {
      warnings.push({reason: 'invalid_shape'});
      continue;
    }

    const fn = raw.function;
    const name = safeToolName(fn.name);
    if (!name) {
      warnings.push({reason: 'invalid_name'});
      continue;
    }

    const parameters: Record<string, unknown> = isPlainObject(fn.parameters)
      ? {...fn.parameters}
      : {type: 'object'};
    if (parameters.type !== undefined && parameters.type !== 'object') {
      warnings.push({reason: 'non_object_parameters', toolName: name});
      continue;
    }

    delete parameters.$schema;
    delete parameters.$defs;
    delete parameters.definitions;
    // `zod-to-json-schema` emits a root-level `default` (from `.default()`) and
    // `additionalProperties` that OpenAI-compatible function schemas don't need;
    // drop them to keep the historical minimal parameters payload.
    delete parameters.default;
    delete parameters.additionalProperties;
    parameters.type = 'object';
    if (!isPlainObject(parameters.properties)) parameters.properties = {};
    if (!Array.isArray(parameters.required)) parameters.required = [];
    parameters.required = (parameters.required as unknown[]).filter((entry): entry is string => typeof entry === 'string');

    const candidate: OpenAICompatibleFunctionTool = {
      type: 'function',
      function: {
        name,
        description: typeof fn.description === 'string' ? fn.description : '',
        parameters: parameters as OpenAICompatibleFunctionTool['function']['parameters'],
      },
    };
    if (validateOpenAICompatibleTool(candidate)) {
      sanitized.push(candidate);
    } else {
      warnings.push({reason: 'invalid_shape', toolName: name});
    }
  }

  return {tools: sanitized, warnings};
};

export const sanitizeOpenAICompatibleTools = (
  tools: unknown[],
): OpenAICompatibleFunctionTool[] => {
  const result = sanitizeOpenAICompatibleToolsWithWarnings(tools);
  for (const warning of result.warnings) {
    logger.debug('Dropped invalid OpenAI-compatible tool schema', warning);
  }
  return result.tools;
};

export const extractToolSchemaNameFromProviderError = (rawBody: string): string | undefined => {
  try {
    const parsed = JSON.parse(rawBody) as {error?: {message?: string; param?: string}; message?: string};
    const message = parsed.error?.message ?? parsed.message ?? '';
    const fromMessage = message.match(/function ['"]([^'"]+)['"]/iu)?.[1];
    if (fromMessage) return fromMessage;
    const fromParam = parsed.error?.param?.match(/tools\[(\d+)\]/iu)?.[0];
    return fromParam;
  } catch {
    return rawBody.match(/function ['"]([^'"]+)['"]/iu)?.[1];
  }
};

export const isToolSchemaProviderError = (rawBody: string): boolean =>
  /invalid schema for function|object schema missing properties|function\.parameters|tools\[\d+\]\.function\.parameters/iu.test(rawBody);
