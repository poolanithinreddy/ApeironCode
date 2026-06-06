export type FailureSource = 'test' | 'lint' | 'typescript' | 'runtime' | 'unknown';

export interface FailureSignal {
  confidence: number;
  file?: string;
  line?: number;
  message: string;
  source: FailureSource;
  symbol?: string;
  testName?: string;
}

const TS_ERROR_RE = /^([^\s(:]+\.(?:ts|tsx|js|jsx|mjs|cjs)):(\d+)(?::(\d+))?\s*[-:]\s*error\s+TS\d+:\s*(.+)$/u;
const ESLINT_RE = /^([^\s(:]+\.(?:ts|tsx|js|jsx|mjs|cjs)):(\d+)(?::(\d+))?\s+(?:error|warning)\s+(.+)$/u;
const STACK_FRAME_RE = /at\s+(?:async\s+)?(?:([\w.<>$]+)\s*\()?(?:file:\/\/)?([^\s()]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|java)):(\d+)(?::(\d+))?\)?/u;
const VITEST_FAIL_RE = /^\s*(?:FAIL|✘|×)\s+(\S+\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|java))\s*[>›]\s*(.+?)\s*$/u;
const PYTEST_FAIL_RE = /^FAILED\s+([^:]+\.py)::(\S+)/u;
const PYTEST_TRACE_RE = /^\s*([^\s]+\.py):(\d+):/u;
const GO_FAIL_RE = /^\s*--- FAIL: (\S+)\s/u;
const JAVA_FAIL_RE = /^\s*at\s+([\w$.]+)\(([\w$]+\.java):(\d+)\)/u;

// eslint-disable-next-line no-control-regex
const stripAnsi = (text: string): string => text.replace(/\[[0-9;]*[A-Za-z]/gu, '');

export const extractFailureSignals = (output: string): FailureSignal[] => {
  if (!output) return [];
  const cleaned = stripAnsi(output);
  const signals: FailureSignal[] = [];
  const seen = new Set<string>();
  const push = (signal: FailureSignal): void => {
    const key = `${signal.source}|${signal.file ?? ''}|${signal.line ?? ''}|${signal.symbol ?? ''}|${signal.testName ?? ''}|${signal.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    signals.push(signal);
  };

  const lines = cleaned.split(/\r?\n/u);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const ts = TS_ERROR_RE.exec(line);
    if (ts) {
      push({confidence: 0.95, file: ts[1], line: Number(ts[2]), message: ts[4] ?? '', source: 'typescript'});
      continue;
    }
    const lint = ESLINT_RE.exec(line);
    if (lint) {
      push({confidence: 0.85, file: lint[1], line: Number(lint[2]), message: lint[4] ?? '', source: 'lint'});
      continue;
    }
    const vitest = VITEST_FAIL_RE.exec(line);
    if (vitest) {
      push({confidence: 0.9, file: vitest[1], message: vitest[2] ?? '', source: 'test', testName: vitest[2]});
      continue;
    }
    const pytest = PYTEST_FAIL_RE.exec(line);
    if (pytest) {
      push({confidence: 0.9, file: pytest[1], message: `pytest failure: ${pytest[2] ?? ''}`, source: 'test', testName: pytest[2]});
      continue;
    }
    const pytrace = PYTEST_TRACE_RE.exec(line);
    if (pytrace) {
      push({confidence: 0.7, file: pytrace[1], line: Number(pytrace[2]), message: line.trim(), source: 'test'});
    }
    const goFail = GO_FAIL_RE.exec(line);
    if (goFail) {
      push({confidence: 0.85, message: line.trim(), source: 'test', testName: goFail[1]});
    }
    const javaFail = JAVA_FAIL_RE.exec(line);
    if (javaFail) {
      push({confidence: 0.8, file: javaFail[2], line: Number(javaFail[3]), message: line.trim(), source: 'runtime', symbol: javaFail[1]});
    }
    const stack = STACK_FRAME_RE.exec(line);
    if (stack) {
      push({
        confidence: 0.75,
        file: stack[2],
        line: Number(stack[3] ?? '0'),
        message: line.trim(),
        source: 'runtime',
        symbol: stack[1],
      });
    }
  }
  return signals;
};

const normalizePath = (filePath: string): string => filePath.replace(/^\.\//u, '').replace(/\\/gu, '/');

export const mapFailuresToFiles = (
  output: string,
  files: string[],
  cwd: string,
): Map<string, number> => {
  const known = new Set(files);
  const knownEnds = new Map<string, string>();
  for (const f of files) knownEnds.set(f.toLowerCase(), f);
  const cwdNorm = normalizePath(cwd).replace(/\/$/u, '');
  const score = new Map<string, number>();
  const signals = extractFailureSignals(output);
  for (const signal of signals) {
    if (!signal.file) continue;
    let candidate = normalizePath(signal.file);
    if (cwdNorm && candidate.startsWith(`${cwdNorm}/`)) {
      candidate = candidate.slice(cwdNorm.length + 1);
    }
    if (!known.has(candidate)) {
      const lc = candidate.toLowerCase();
      let match: string | undefined;
      for (const [end, original] of knownEnds) {
        if (lc.endsWith(end) || end.endsWith(lc)) {
          match = original;
          break;
        }
      }
      if (!match) continue;
      candidate = match;
    }
    score.set(candidate, (score.get(candidate) ?? 0) + signal.confidence);
  }
  return score;
};

export const formatFailureSignals = (signals: FailureSignal[]): string => {
  if (signals.length === 0) return 'No failure signals detected.';
  const lines = ['Failure signals:'];
  for (const s of signals.slice(0, 25)) {
    const loc = s.file ? `${s.file}${s.line ? `:${s.line}` : ''}` : '(unknown)';
    const tag = s.testName ? ` test=${s.testName}` : s.symbol ? ` symbol=${s.symbol}` : '';
    lines.push(`  - [${s.source}] ${loc}${tag} :: ${s.message.slice(0, 160)}`);
  }
  if (signals.length > 25) lines.push(`  ... ${signals.length - 25} more`);
  return lines.join('\n');
};
