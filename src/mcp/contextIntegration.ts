import {compressToolOutput} from '../tools/outputCompressor.js';
import {redactString} from './redaction.js';

const SECRET_PATTERNS: RegExp[] = [
  /[A-Za-z0-9_-]*(?:secret|token|password|api[_-]?key)[A-Za-z0-9_-]*\s*[:=]\s*[A-Za-z0-9._\-/+=]{6,}/giu,
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gu,
  /ghp_[A-Za-z0-9]{30,}/gu,
  /xox[abprs]-[A-Za-z0-9-]{10,}/gu,
  /sk-[A-Za-z0-9]{20,}/gu,
];

export interface ResourceContextOptions {
  knownSecrets?: string[];
  maxBytes?: number;
  source: string;
}

export interface ResourceContextResult {
  bytes: number;
  content: string;
  redactedHits: number;
  source: string;
  truncated: boolean;
}

const RESOURCE_PREVIEW_MULTIPLIER = 4;
const RESOURCE_PREVIEW_FLOOR_BYTES = 4_000;

const redactPatterns = (text: string): {redacted: string; hits: number} => {
  let hits = 0;
  let redacted = text;
  for (const re of SECRET_PATTERNS) {
    redacted = redacted.replace(re, () => {
      hits += 1;
      return '[REDACTED]';
    });
  }
  return {hits, redacted};
};

export const prepareResourceForContext = (
  rawContent: string,
  options: ResourceContextOptions,
): ResourceContextResult => {
  const maxBytes = options.maxBytes ?? 10_000;
  const previewByteBudget = Math.max(
    RESOURCE_PREVIEW_FLOOR_BYTES,
    maxBytes * RESOURCE_PREVIEW_MULTIPLIER,
  );
  const rawPreview = Buffer.byteLength(rawContent, 'utf8') > previewByteBudget
    ? rawContent.slice(0, previewByteBudget)
    : rawContent;
  const knownRedacted = redactString(rawPreview, options.knownSecrets ?? []);
  const {hits, redacted} = redactPatterns(knownRedacted);
  const compressed = compressToolOutput(`mcp:${options.source}`, redacted, {
    maxTokens: 2_000,
    preserveErrors: true,
    preserveFailingTests: false,
    preserveStackTraces: false,
  });
  let content = compressed.content;
  let truncated = rawPreview.length < rawContent.length;
  if (Buffer.byteLength(content, 'utf8') > maxBytes) {
    content = content.slice(0, maxBytes);
    truncated = true;
  }
  const sourceLine = `[mcp resource: ${options.source}]`;
  return {
    bytes: Buffer.byteLength(content, 'utf8'),
    content: `${sourceLine}\n${content}`,
    redactedHits: hits,
    source: options.source,
    truncated,
  };
};

export interface PromptPreviewInput {
  args?: Record<string, unknown>;
  description?: string;
  name: string;
  template?: string;
}

export interface PromptPreviewOutput {
  description?: string;
  injection: 'preview' | 'requires-confirmation';
  knownArguments: string[];
  name: string;
  rendered: string;
}

const renderPlaceholders = (template: string, args: Record<string, unknown>): string => {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/gu, (_, key: string) => {
    const value = args[key];
    if (value === undefined || value === null) return `{{${key}}}`;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
  });
};

export const previewMcpPrompt = (input: PromptPreviewInput): PromptPreviewOutput => {
  const args = input.args ?? {};
  const rendered = input.template ? renderPlaceholders(input.template, args) : `(no template) ${input.name}`;
  const safeRendered = redactPatterns(rendered).redacted;
  return {
    description: input.description,
    injection: 'requires-confirmation',
    knownArguments: Object.keys(args).sort(),
    name: input.name,
    rendered: safeRendered.slice(0, 4_000),
  };
};

export interface PromptInjectionDecision {
  approved: boolean;
  reason?: string;
}

export const requirePromptInjectionApproval = (
  decision: PromptInjectionDecision,
): {error?: string; injected: boolean} => {
  if (!decision.approved) {
    return {error: decision.reason ?? 'MCP prompt injection requires explicit user approval.', injected: false};
  }
  return {injected: true};
};
