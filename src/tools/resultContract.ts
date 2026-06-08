export type ToolResultSeverity = 'info' | 'warning' | 'error';

export interface NormalizedToolResult {
  toolName: string;
  ok: boolean;
  severity: ToolResultSeverity;
  summary: string;
  output: string;
  truncated: boolean;
  exitCode?: number;
  metadata?: Record<string, unknown>;
}

export interface ToolResultContractIssue {
  field: string;
  message: string;
}

const MAX_OUTPUT_CHARS = 4000;

const SECRET_PATTERNS: Array<{re: RegExp; replacement: string}> = [
  {re: /Bearer\s+[A-Za-z0-9._\-+/=]{16,}/gu, replacement: 'Bearer [REDACTED]'},
  {re: /AKIA[0-9A-Z]{16}/gu, replacement: '[REDACTED_AWS_KEY]'},
  {re: /sk-[A-Za-z0-9]{20,}/gu, replacement: '[REDACTED_OPENAI_KEY]'},
  {
    re: /\b(secret|token|password|api[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9._\-+/=]{8,}["']?/giu,
    replacement: '$1=[REDACTED]',
  },
];

export const redactSecrets = (text: string): string => {
  let out = text;
  for (const {re, replacement} of SECRET_PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
};

const PRESERVE_LINE_RE = /(FAIL|Error:|Traceback|✗|×)/u;

const compressOutput = (text: string): {text: string; truncated: boolean} => {
  if (text.length <= MAX_OUTPUT_CHARS) {
    return {text, truncated: false};
  }
  const lines = text.split('\n');
  const preserved: string[] = [];
  for (const line of lines) {
    if (PRESERVE_LINE_RE.test(line)) preserved.push(line);
  }
  const head = text.slice(0, Math.floor(MAX_OUTPUT_CHARS / 2));
  const tail = text.slice(-Math.floor(MAX_OUTPUT_CHARS / 4));
  const preservedBlock = preserved.length > 0
    ? `\n--- preserved failure lines ---\n${preserved.join('\n')}\n`
    : '';
  const truncatedNotice = `\n... [truncated ${text.length - MAX_OUTPUT_CHARS} chars] ...\n`;
  return {
    text: `${head}${truncatedNotice}${preservedBlock}${tail}`,
    truncated: true,
  };
};

export const normalizeToolResult = (toolName: string, result: unknown): NormalizedToolResult => {
  const r = (result ?? {}) as Record<string, unknown>;
  const ok = typeof r.ok === 'boolean' ? r.ok : !r.error;
  const summaryRaw = typeof r.summary === 'string' ? r.summary : '';
  const outputRaw = typeof r.output === 'string' ? r.output : '';
  const exitCode = typeof r.exitCode === 'number'
    ? r.exitCode
    : typeof (r.metadata as Record<string, unknown> | undefined)?.exitCode === 'number'
      ? (r.metadata as Record<string, number>).exitCode
      : undefined;
  const compressed = compressOutput(outputRaw);
  const severity: ToolResultSeverity = ok ? 'info' : 'error';
  return {
    toolName,
    ok,
    severity,
    summary: redactSecrets(summaryRaw),
    output: redactSecrets(compressed.text),
    truncated: compressed.truncated,
    exitCode,
    metadata: r.metadata as Record<string, unknown> | undefined,
  };
};

export const validateToolResultContract = (
  toolName: string,
  result: unknown,
): ToolResultContractIssue[] => {
  const issues: ToolResultContractIssue[] = [];
  if (!result || typeof result !== 'object') {
    issues.push({field: 'root', message: `Tool ${toolName} did not return an object.`});
    return issues;
  }
  const r = result as Record<string, unknown>;
  if (typeof r.ok !== 'boolean') {
    issues.push({field: 'ok', message: 'Missing required boolean field "ok"'});
  }
  if (typeof r.summary !== 'string') {
    issues.push({field: 'summary', message: 'Missing required string field "summary"'});
  }
  if (typeof r.output !== 'string') {
    issues.push({field: 'output', message: 'Missing required string field "output"'});
  }
  return issues;
};

export interface FormatOptions {
  maxOutputChars?: number;
}

export const formatToolResultForModel = (
  result: NormalizedToolResult,
  options: FormatOptions = {},
): string => {
  void options;
  const lines: string[] = [`[${result.severity.toUpperCase()}] ${result.toolName}: ${result.summary}`];
  if (result.exitCode !== undefined) {
    lines.push(`exitCode: ${result.exitCode}`);
  }
  if (result.output) {
    lines.push(result.output);
  }
  if (result.truncated) {
    lines.push('(output truncated)');
  }
  return lines.join('\n');
};

export const formatToolResultForUser = (
  result: NormalizedToolResult,
  options: FormatOptions = {},
): string => {
  void options;
  const indicator = result.severity === 'error' ? '[FAIL]' : result.severity === 'warning' ? '[WARN]' : '[OK]';
  const head = `${indicator} ${result.toolName} — ${result.summary}`;
  if (!result.output) return head;
  return `${head}\n${result.output}`;
};
