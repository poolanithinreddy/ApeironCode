import type {ProviderToolDefinition} from './schema.js';
import {estimateObjectTokens} from '../tokens/estimate.js';

const RISKY_TOOLS = new Set(['edit_file', 'write_file', 'patch_file', 'run_command', 'revert_patch']);
const SHORT_DESC_THRESHOLD = 20;

export interface SchemaMinifyResult {
  minified: ProviderToolDefinition;
  charsRemoved: number;
  tokensSaved: number;
}

export interface SchemaMinifyOptions {
  providerId?: string;
}

interface JsonSchemaLike {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchemaLike>;
  required?: string[];
  items?: JsonSchemaLike;
  enum?: unknown[];
  [k: string]: unknown;
}

const sortObjectKeys = <T extends Record<string, unknown>>(obj: T): T => {
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    sorted[k] = obj[k];
  }
  return sorted as T;
};

const minifyProperties = (
  properties: Record<string, JsonSchemaLike>,
  preserveAll: boolean,
): {properties: Record<string, JsonSchemaLike>; charsRemoved: number} => {
  let removed = 0;
  const sorted = sortObjectKeys(properties);
  const out: Record<string, JsonSchemaLike> = {};
  for (const [key, value] of Object.entries(sorted)) {
    const copy: JsonSchemaLike = {...value};
    if (
      !preserveAll
      && typeof copy.description === 'string'
      && copy.description.length <= SHORT_DESC_THRESHOLD
    ) {
      removed += copy.description.length;
      delete copy.description;
    }
    out[key] = copy;
  }
  return {properties: out, charsRemoved: removed};
};

const shouldPreserveDescriptions = (def: ProviderToolDefinition, options?: SchemaMinifyOptions): boolean =>
  RISKY_TOOLS.has(def.name) || options?.providerId === 'anthropic';

export const minifyToolSchema = (
  def: ProviderToolDefinition,
  options?: SchemaMinifyOptions,
): SchemaMinifyResult => {
  const preserveAll = shouldPreserveDescriptions(def, options);
  const schema = def.input_schema as unknown as JsonSchemaLike;
  let charsRemoved = 0;
  const newSchema: JsonSchemaLike = {...schema};
  if (schema.properties && typeof schema.properties === 'object') {
    const result = minifyProperties(schema.properties, preserveAll);
    newSchema.properties = result.properties;
    charsRemoved += result.charsRemoved;
  }
  return {
    minified: {
      name: def.name,
      description: preserveAll ? def.description : def.description.trim(),
      input_schema: newSchema as ProviderToolDefinition['input_schema'],
    },
    charsRemoved,
    tokensSaved: Math.max(0, estimateObjectTokens(def) - estimateObjectTokens({
      description: preserveAll ? def.description : def.description.trim(),
      input_schema: newSchema,
      name: def.name,
    })),
  };
};

export const minifyToolSchemas = (
  defs: ProviderToolDefinition[],
  options?: SchemaMinifyOptions,
): SchemaMinifyResult[] => {
  return defs.map((d) => minifyToolSchema(d, options));
};
