export interface ParsedFailure {
  command?: string;
  failingTests: string[];
  filePaths: Array<{file: string; line?: number}>;
  packageOrWorkspace?: string;
  rawAssertions: string[];
  stackFrames: string[];
}

const NOISE_PATTERNS: Array<RegExp> = [
  /^npm warn /iu,
  /^npm notice /iu,
  /^>\s*[^\n]*$/u,
  /^\s*[█░▓░▒▓█]+\s*\d+%/u,
  /^\s*\[?\d+%\]?\s+/u,
  /^\s*at\s+(node:|internal\/)/u,
  /^\s*npm http /iu,
  /^\s*added \d+ packages/iu,
  /^\s*npm fund /iu,
  /^\s*\d+\s+vulnerabilities/iu,
  // eslint-disable-next-line no-control-regex
  /\u001b\[/u,
];

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001b\[[0-?]*[ -/]*[@-~]/gu;

export const stripAnsi = (text: string): string =>
  text.replace(ANSI_RE, '').replace(/\r/gu, '');

const isNoise = (line: string): boolean => NOISE_PATTERNS.some((re) => re.test(line));

const collapseRepeats = (lines: string[]): string[] => {
  const out: string[] = [];
  let last: string | undefined;
  let count = 0;
  for (const line of lines) {
    if (line === last) {
      count += 1;
      continue;
    }
    if (count > 0) {
      out.push(`  ... repeated ${count + 1}x`);
    }
    out.push(line);
    last = line;
    count = 0;
  }
  if (count > 0) {
    out.push(`  ... repeated ${count + 1}x`);
  }
  return out;
};

export const compressCiLog = (raw: string): string => {
  const stripped = stripAnsi(raw);
  const filtered = stripped.split('\n').filter((line) => line.trim().length > 0 && !isNoise(line));
  return collapseRepeats(filtered).join('\n');
};

const FILE_LINE_RE = /([./\w-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|swift)):(\d+)(?::(\d+))?/giu;
const TEST_RE = /(?:✗|✘|FAIL|✖|×)\s+([\w./ -]+?)(?=\s*(?:\(|\d+ms|$))/giu;
const VITEST_FAIL_RE = /^\s*(?:FAIL|✘)\s+(\S+)\s*[>›]\s*(.+?)\s*$/u;
const ASSERTION_RE = /(AssertionError|Expected:|Received:|expected\b|to equal|to be|toBe|toEqual)/u;
const STACK_RE = /^\s*at\s+.+?\(([^)]+)\)/u;
const COMMAND_RE = /^\$\s+(.+)$|^>\s*([\w@/-]+\s+[^\n]+)$/u;
const WORKSPACE_RE = /(?:workspace|package)\s+["`']?([\w@\-./]+)["`']?/iu;

export const parseCiFailureLog = (raw: string): ParsedFailure => {
  const compressed = compressCiLog(raw);
  const failingTests = new Set<string>();
  const rawAssertions: string[] = [];
  const stackFrames: string[] = [];
  const filePaths: ParsedFailure['filePaths'] = [];
  let command: string | undefined;
  let packageOrWorkspace: string | undefined;

  for (const line of compressed.split('\n')) {
    const v = VITEST_FAIL_RE.exec(line);
    if (v) {
      failingTests.add(`${v[1]} > ${v[2]}`);
    }
    let tm: RegExpExecArray | null;
    TEST_RE.lastIndex = 0;
    while ((tm = TEST_RE.exec(line)) !== null) {
      const name = tm[1]?.trim();
      if (name && name.length > 1 && name.length < 200) {
        failingTests.add(name);
      }
    }
    if (ASSERTION_RE.test(line)) {
      rawAssertions.push(line.trim());
    }
    const sm = STACK_RE.exec(line);
    if (sm) {
      stackFrames.push(line.trim());
    }
    let fm: RegExpExecArray | null;
    FILE_LINE_RE.lastIndex = 0;
    while ((fm = FILE_LINE_RE.exec(line)) !== null) {
      filePaths.push({file: fm[1] ?? '', line: fm[2] ? Number.parseInt(fm[2], 10) : undefined});
    }
    if (!command) {
      const cm = COMMAND_RE.exec(line);
      if (cm) {
        command = (cm[1] ?? cm[2] ?? '').trim();
      }
    }
    if (!packageOrWorkspace) {
      const wm = WORKSPACE_RE.exec(line);
      if (wm) {
        packageOrWorkspace = wm[1];
      }
    }
  }

  const dedupePaths = new Map<string, ParsedFailure['filePaths'][number]>();
  for (const p of filePaths) {
    const k = `${p.file}:${p.line ?? ''}`;
    if (!dedupePaths.has(k)) {
      dedupePaths.set(k, p);
    }
  }

  return {
    command,
    failingTests: [...failingTests].slice(0, 50),
    filePaths: [...dedupePaths.values()].slice(0, 50),
    packageOrWorkspace,
    rawAssertions: rawAssertions.slice(0, 50),
    stackFrames: stackFrames.slice(0, 50),
  };
};

export const formatParsedFailure = (parsed: ParsedFailure): string => {
  const lines: string[] = [];
  if (parsed.command) lines.push(`Command: ${parsed.command}`);
  if (parsed.packageOrWorkspace) lines.push(`Workspace: ${parsed.packageOrWorkspace}`);
  if (parsed.failingTests.length > 0) {
    lines.push('Failing tests:');
    for (const t of parsed.failingTests) lines.push(`  - ${t}`);
  }
  if (parsed.rawAssertions.length > 0) {
    lines.push('Assertions:');
    for (const a of parsed.rawAssertions.slice(0, 10)) lines.push(`  ${a}`);
  }
  if (parsed.filePaths.length > 0) {
    lines.push('Locations:');
    for (const p of parsed.filePaths.slice(0, 20)) lines.push(`  ${p.file}${p.line ? `:${p.line}` : ''}`);
  }
  if (parsed.stackFrames.length > 0) {
    lines.push('Stack:');
    for (const f of parsed.stackFrames.slice(0, 10)) lines.push(`  ${f}`);
  }
  return lines.join('\n');
};

export interface CheckRunArtifactSummary {
  archiveSizeBytes?: number;
  expired?: boolean;
  expiresAt?: string;
  id: number;
  name: string;
  url?: string;
}

interface RawArtifact {
  archive_download_url?: string;
  expired?: boolean;
  expires_at?: string;
  id: number;
  name?: string;
  size_in_bytes?: number;
}

export const mapArtifactMetadata = (raw: RawArtifact): CheckRunArtifactSummary => ({
  archiveSizeBytes: raw.size_in_bytes,
  expired: raw.expired,
  expiresAt: raw.expires_at,
  id: raw.id,
  name: raw.name ?? `artifact-${raw.id}`,
  url: raw.archive_download_url,
});
