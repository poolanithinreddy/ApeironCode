import type {ParsedShellCommand, ShellOperator, ShellRedirect} from './types.js';

const NETWORK_COMMANDS = new Set([
  'curl', 'wget', 'fetch', 'ssh', 'scp', 'rsync', 'nc', 'ncat', 'netcat', 'ftp', 'sftp',
]);

const PACKAGE_MANAGERS = new Set([
  'npm', 'pnpm', 'yarn', 'bun', 'pip', 'pip3', 'gem', 'cargo', 'go',
]);

const DESTRUCTIVE_COMMANDS = new Set([
  'rm', 'rmdir', 'dd', 'mkfs', 'fdisk', 'format', 'shred', 'truncate',
  'kill', 'pkill', 'killall', 'shutdown', 'reboot',
]);

const ENV_ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/u;

interface SplitToken {
  text: string;
  // True if produced from quoted segment (so should not be a separator)
  quoted: boolean;
}

const tokenizeRespectingQuotes = (input: string): SplitToken[] => {
  const tokens: SplitToken[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let quotedSegment = false;
  let i = 0;

  const flush = (): void => {
    if (current.length > 0) {
      tokens.push({text: current, quoted: quotedSegment});
      current = '';
      quotedSegment = false;
    }
  };

  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1];

    if (!inSingle && !inDouble && ch === '\\' && next !== undefined) {
      // Escape: keep both characters literal, skip past
      current += next;
      i += 2;
      continue;
    }

    if (!inDouble && ch === "'") {
      inSingle = !inSingle;
      quotedSegment = true;
      i += 1;
      continue;
    }
    if (!inSingle && ch === '"') {
      inDouble = !inDouble;
      quotedSegment = true;
      i += 1;
      continue;
    }

    if (!inSingle && !inDouble && ch !== undefined && /\s/u.test(ch)) {
      flush();
      i += 1;
      continue;
    }

    current += ch ?? '';
    i += 1;
  }
  flush();
  return tokens;
};

interface OperatorSplit {
  operator: ShellOperator | null;
  segment: string;
}

/** Split the raw command on top-level operators (&&, ||, ;, |), respecting quotes/parens. */
const splitOnOperators = (raw: string): OperatorSplit[] => {
  const parts: OperatorSplit[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let parenDepth = 0;
  let i = 0;

  const push = (op: ShellOperator | null): void => {
    parts.push({operator: op, segment: current});
    current = '';
  };

  while (i < raw.length) {
    const ch = raw[i];
    const next = raw[i + 1];

    if (!inSingle && !inDouble) {
      if (ch === '\\' && next !== undefined) {
        current += ch + next;
        i += 2;
        continue;
      }
      if (ch === '$' && next === '(') {
        parenDepth += 1;
        current += '$(';
        i += 2;
        continue;
      }
      if (ch === '(' && parenDepth > 0) {
        parenDepth += 1;
        current += ch;
        i += 1;
        continue;
      }
      if (ch === ')' && parenDepth > 0) {
        parenDepth -= 1;
        current += ch;
        i += 1;
        continue;
      }

      if (parenDepth === 0) {
        if (ch === '&' && next === '&') {
          push('&&');
          i += 2;
          continue;
        }
        if (ch === '|' && next === '|') {
          push('||');
          i += 2;
          continue;
        }
        if (ch === ';') {
          push(';');
          i += 1;
          continue;
        }
        if (ch === '|') {
          push('|');
          i += 1;
          continue;
        }
      }
    }

    if (!inDouble && ch === "'") {
      inSingle = !inSingle;
    } else if (!inSingle && ch === '"') {
      inDouble = !inDouble;
    }

    current += ch ?? '';
    i += 1;
  }
  push(null);
  return parts;
};

const detectSubshells = (raw: string): {subshells: string[]; hasCommandSubstitution: boolean} => {
  const subshells: string[] = [];
  let hasSub = false;
  let i = 0;
  let inSingle = false;
  let inDouble = false;

  while (i < raw.length) {
    const ch = raw[i];
    const next = raw[i + 1];
    if (!inDouble && ch === "'") {
      inSingle = !inSingle;
      i += 1;
      continue;
    }
    if (!inSingle && ch === '"') {
      inDouble = !inDouble;
      i += 1;
      continue;
    }
    if (!inSingle) {
      if (ch === '`') {
        hasSub = true;
        let j = i + 1;
        let inner = '';
        while (j < raw.length && raw[j] !== '`') {
          inner += raw[j];
          j += 1;
        }
        subshells.push(inner);
        i = j + 1;
        continue;
      }
      if (ch === '$' && next === '(') {
        hasSub = true;
        let depth = 1;
        let j = i + 2;
        let inner = '';
        while (j < raw.length && depth > 0) {
          if (raw[j] === '(') depth += 1;
          else if (raw[j] === ')') {
            depth -= 1;
            if (depth === 0) break;
          }
          inner += raw[j];
          j += 1;
        }
        subshells.push(inner);
        i = j + 1;
        continue;
      }
    }
    i += 1;
  }
  return {subshells, hasCommandSubstitution: hasSub};
};

const REDIRECT_PATTERNS: Array<{re: RegExp; kind: ShellRedirect}> = [
  {re: /^2>&1$/u, kind: '2>&1'},
  {re: /^2>$/u, kind: '2>'},
  {re: /^>>$/u, kind: '>>'},
  {re: /^>$/u, kind: '>'},
  {re: /^<$/u, kind: '<'},
];

const extractRedirects = (
  tokens: SplitToken[],
): {tokens: SplitToken[]; redirects: Array<{kind: ShellRedirect; target: string}>; warnings: string[]} => {
  const redirects: Array<{kind: ShellRedirect; target: string}> = [];
  const warnings: string[] = [];
  const remaining: SplitToken[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    if (!tok || tok.quoted) {
      if (tok) remaining.push(tok);
      continue;
    }
    let matched: ShellRedirect | null = null;
    for (const pat of REDIRECT_PATTERNS) {
      if (pat.re.test(tok.text)) {
        matched = pat.kind;
        break;
      }
    }
    if (matched === '2>&1') {
      redirects.push({kind: '2>&1', target: ''});
      continue;
    }
    if (matched) {
      const target = tokens[i + 1];
      if (target) {
        redirects.push({kind: matched, target: target.text});
        i += 1;
      } else {
        warnings.push('redirect with missing target');
        redirects.push({kind: matched, target: ''});
      }
      continue;
    }
    // Inline redirects like ">file" attached to a token
    const inlineMatch = tok.text.match(/^(>>|2>|>|<)(.*)$/u);
    if (inlineMatch && inlineMatch[2] && inlineMatch[1]) {
      redirects.push({kind: inlineMatch[1] as ShellRedirect, target: inlineMatch[2]});
      continue;
    }
    remaining.push(tok);
  }
  return {tokens: remaining, redirects, warnings};
};

const parseSegment = (segment: string, parseWarnings: string[]): ParsedShellCommand => {
  const trimmed = segment.trim();
  const sub = detectSubshells(trimmed);
  let tokens = tokenizeRespectingQuotes(trimmed);

  const envAssignments: Record<string, string> = {};
  while (tokens.length > 0) {
    const head = tokens[0];
    if (!head || head.quoted) break;
    if (ENV_ASSIGNMENT_RE.test(head.text)) {
      const eq = head.text.indexOf('=');
      const key = head.text.slice(0, eq);
      const value = head.text.slice(eq + 1);
      envAssignments[key] = value;
      tokens = tokens.slice(1);
    } else {
      break;
    }
  }

  const redirectExtraction = extractRedirects(tokens);
  tokens = redirectExtraction.tokens;
  parseWarnings.push(...redirectExtraction.warnings);

  const baseToken = tokens[0];
  const baseCommand = baseToken ? baseToken.text : '';
  const args = tokens.slice(1).map((t) => t.text);

  const baseLower = baseCommand.toLowerCase();
  const hasNetworkCommand = NETWORK_COMMANDS.has(baseLower);
  const hasPackageManager = PACKAGE_MANAGERS.has(baseLower);
  const hasDestructive = DESTRUCTIVE_COMMANDS.has(baseLower);

  if (!baseCommand && trimmed.length > 0) {
    parseWarnings.push('could not identify base command');
  }

  return {
    raw: segment,
    baseCommand,
    args,
    envAssignments,
    chains: [],
    redirects: redirectExtraction.redirects,
    subshells: sub.subshells,
    hasCommandSubstitution: sub.hasCommandSubstitution,
    hasNetworkCommand,
    hasPackageManager,
    hasDestructive,
    parseWarnings: [],
  };
};

export const parseShellCommand = (raw: string): ParsedShellCommand => {
  const parseWarnings: string[] = [];
  const splits = splitOnOperators(raw);
  if (splits.length === 0) {
    return parseSegment(raw, parseWarnings);
  }

  const head = splits[0];
  if (!head) {
    const empty = parseSegment(raw, parseWarnings);
    empty.parseWarnings = parseWarnings;
    return empty;
  }

  const root = parseSegment(head.segment, parseWarnings);
  root.raw = raw;
  // For each subsequent segment, attach to chains
  for (let i = 1; i < splits.length; i += 1) {
    const part = splits[i];
    if (!part) continue;
    const prev = splits[i - 1];
    const op = prev?.operator;
    if (!op) continue;
    const segCommand = parseSegment(part.segment, parseWarnings);
    root.chains.push({operator: op, command: segCommand});
    if (segCommand.hasNetworkCommand) root.hasNetworkCommand = true;
    if (segCommand.hasPackageManager) root.hasPackageManager = true;
    if (segCommand.hasDestructive) root.hasDestructive = true;
    if (segCommand.hasCommandSubstitution) root.hasCommandSubstitution = true;
  }

  // Redact any potential secret-like content from warnings (defensive)
  root.parseWarnings = parseWarnings.map((w) => w.replace(/[A-Za-z0-9_-]{20,}/gu, '[redacted]'));
  return root;
};
