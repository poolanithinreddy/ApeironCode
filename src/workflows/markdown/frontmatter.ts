/**
 * Markdown frontmatter parser for ApeironCode workflow definitions.
 * Supports YAML-like simple fields: strings, booleans, numbers, arrays.
 * No external parser dependency. No eval. No secrets in errors.
 */

const FRONTMATTER_DELIMITER = '---';
const MAX_FRONTMATTER_BYTES = 8_192;
const MAX_FRONTMATTER_LINES = 200;

export type FrontmatterValue = string | boolean | number | string[];

export interface ParsedFrontmatter {
  data: Record<string, FrontmatterValue>;
  body: string;
}

export interface FrontmatterParseError {
  ok: false;
  error: string;
}

export interface FrontmatterParseSuccess {
  ok: true;
  data: Record<string, FrontmatterValue>;
  body: string;
}

export type FrontmatterParseResult = FrontmatterParseSuccess | FrontmatterParseError;

const trimLine = (line: string): string => line.trim();

const parseScalarValue = (raw: string): FrontmatterValue => {
  const trimmed = raw.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  const num = Number(trimmed);
  if (trimmed !== '' && !Number.isNaN(num)) return num;
  // Strip optional surrounding quotes
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const parseInlineArray = (raw: string): string[] => {
  // Expects format: [item1, item2, "item3"]
  const inner = raw.trim().slice(1, -1); // strip [ ]
  if (!inner.trim()) return [];
  return inner
    .split(',')
    .map((s) => {
      const t = s.trim();
      if ((t.startsWith('"') && t.endsWith('"')) ||
          (t.startsWith("'") && t.endsWith("'"))) {
        return t.slice(1, -1);
      }
      return t;
    })
    .filter((s) => s.length > 0);
};

const parseFrontmatterBlock = (block: string): Record<string, FrontmatterValue> | string => {
  const data: Record<string, FrontmatterValue> = {};
  const lines = block.split('\n');

  let currentKey: string | null = null;
  const listItems: string[] = [];

  const flushList = (): void => {
    if (currentKey !== null && listItems.length > 0) {
      data[currentKey] = [...listItems];
      listItems.length = 0;
      currentKey = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine;
    if (trimLine(line) === '') continue;

    // YAML list item under a key
    if (line.match(/^\s*-\s+/u) && currentKey !== null) {
      const itemVal = line.replace(/^\s*-\s+/u, '').trim();
      const stripped =
        (itemVal.startsWith('"') && itemVal.endsWith('"')) ||
        (itemVal.startsWith("'") && itemVal.endsWith("'"))
          ? itemVal.slice(1, -1)
          : itemVal;
      listItems.push(stripped);
      continue;
    }

    // New key-value pair
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      if (trimLine(line).startsWith('#')) continue; // comment
      continue; // skip unrecognized lines
    }

    flushList();

    const key = line.slice(0, colonIdx).trim();
    const rest = line.slice(colonIdx + 1).trim();

    if (!key || !/^[a-zA-Z_][a-zA-Z0-9_-]*$/u.test(key)) {
      return `invalid key: "${key.slice(0, 40)}"`;
    }

    if (rest === '') {
      // Multi-line list follows
      currentKey = key;
      continue;
    }

    if (rest.startsWith('[') && rest.endsWith(']')) {
      data[key] = parseInlineArray(rest);
      currentKey = null;
      continue;
    }

    data[key] = parseScalarValue(rest);
    currentKey = null;
  }

  flushList();
  return data;
};

export const parseMarkdownFrontmatter = (text: string): FrontmatterParseResult => {
  if (Buffer.byteLength(text, 'utf8') > MAX_FRONTMATTER_BYTES * 10) {
    // Huge document: still parse, but cap frontmatter search
  }

  const lines = text.split('\n');
  if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) {
    return {ok: true, data: {}, body: text};
  }

  const frontmatterLines: string[] = [];
  let closingIdx = -1;

  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === FRONTMATTER_DELIMITER) {
      closingIdx = i;
      break;
    }
    frontmatterLines.push(lines[i] ?? '');
    if (frontmatterLines.length > MAX_FRONTMATTER_LINES) {
      return {ok: false, error: 'frontmatter exceeds maximum line limit'};
    }
  }

  if (closingIdx === -1) {
    return {ok: false, error: 'frontmatter delimiter not closed'};
  }

  const block = frontmatterLines.join('\n');
  if (Buffer.byteLength(block, 'utf8') > MAX_FRONTMATTER_BYTES) {
    return {ok: false, error: 'frontmatter block too large'};
  }

  const parsed = parseFrontmatterBlock(block);
  if (typeof parsed === 'string') {
    return {ok: false, error: `frontmatter parse error: ${parsed}`};
  }

  const body = lines.slice(closingIdx + 1).join('\n');
  return {ok: true, data: parsed, body};
};

export const stripFrontmatter = (text: string): string => {
  const result = parseMarkdownFrontmatter(text);
  if (!result.ok) return text;
  return result.body;
};

export const stringifyMarkdownFrontmatter = (
  data: Record<string, FrontmatterValue>,
  body: string,
): string => {
  if (Object.keys(data).length === 0) return body;

  const lines: string[] = [FRONTMATTER_DELIMITER];
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map((v) => `${v}`).join(', ')}]`);
    } else if (typeof value === 'boolean') {
      lines.push(`${key}: ${value ? 'true' : 'false'}`);
    } else if (typeof value === 'number') {
      lines.push(`${key}: ${value}`);
    } else {
      const needsQuotes = /[:#[\]{},]/u.test(value);
      lines.push(needsQuotes ? `${key}: "${value}"` : `${key}: ${value}`);
    }
  }
  lines.push(FRONTMATTER_DELIMITER);
  lines.push('');
  return lines.join('\n') + body;
};

export const validateFrontmatterObject = (value: unknown): value is Record<string, FrontmatterValue> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof k !== 'string') return false;
    if (typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number') continue;
    if (Array.isArray(v) && v.every((item) => typeof item === 'string')) continue;
    return false;
  }
  return true;
};
