import {execSync} from 'node:child_process';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

const ROOT = path.resolve(__dirname, '../..');

// Patterns that are explicitly allowed to keep references to the legacy
// OpenCode brand: external company names, deliberate legacy fallbacks, the
// preserved CLI alias, deprecated TS aliases, and historical/migration notes.
const ALLOWED_PATTERNS: RegExp[] = [
  /openai/i, // External company / product name. Never renamed.
  /formerly.*opencode/i,
  /legacy.*opencode/i,
  /opencode.*legacy/i,
  /opencode.*alias/i,
  /opencode.*fallback/i,
  /opencode.*compat/i,
  /opencode.*deprecated/i,
  /Deprecated compatibility alias/i,
  /Compatibility alias for legacy OpenCode brand/i,
  /pre-rebrand/i,
  /OPENCODE_\w+.*fallback/i,
  /\.opencode.*fallback/i,
  // Historical note line in CHANGELOG referencing the old XML envelope.
  /<opencode_tool_call>/i,
];

// Substrings in path text that disqualify a hit (skip files entirely).
const SKIP_PATH_SUBSTRINGS = [
  'node_modules',
  '/dist/',
  '.git/',
  'package-lock.json',
  '.tgz',
  // The branding test itself talks about both names by design.
  'tests/branding/staleBranding.test.ts',
];

// File suffixes whose content references are allowed wholesale (these are the
// authoritative places that document the migration or define legacy
// fallbacks; the per-line allowlist above already covers their key lines).
const ALLOWED_FILE_PATHS = [
  // Tests that explicitly verify legacy fallback behaviour.
  'tests/githubAutomation/permissions.test.ts',
  'tests/githubAutomation/issueToPr.test.ts',
  'tests/githubAutomation/idempotency.test.ts',
  'tests/githubAutomation/prReview.test.ts',
  'tests/githubAction/runner.test.ts',
  'tests/e2e/githubAutomation-phase13_6.test.ts',
  'tests/e2e/productFlow.test.ts',
  'tests/smoke/cli-smoke.test.ts',
  // CHANGELOG keeps historical entries under the old brand name.
  'CHANGELOG.md',
  // Phase plan/audit docs are historical artefacts.
  'docs/PHASE15_PLAN.md',
];

const isAllowedPath = (line: string): boolean => {
  for (const skip of SKIP_PATH_SUBSTRINGS) {
    if (line.includes(skip)) return true;
  }
  for (const allowed of ALLOWED_FILE_PATHS) {
    if (line.startsWith(allowed) || line.includes(`/${allowed}`)) return true;
  }
  return false;
};

const isAllowedContent = (line: string): boolean => {
  for (const pattern of ALLOWED_PATTERNS) {
    if (pattern.test(line)) return true;
  }
  return false;
};

describe('ApeironCode brand migration', () => {
  it('has no unintended stale OpenCode references in source/test files', () => {
    let output = '';
    try {
      output = execSync(
        'rg -n --type ts --type tsx --type json '
        + '"OpenCode|opencode-agent|OpenCode-Agent|OpenCodeConfig" '
        + '. 2>/dev/null || true',
        {cwd: ROOT, encoding: 'utf8', timeout: 30_000},
      );
    } catch {
      output = '';
    }

    const violations: string[] = [];
    for (const line of output.split('\n')) {
      if (!line) continue;
      if (isAllowedPath(line)) continue;
      if (isAllowedContent(line)) continue;
      // Allow the legacy `opencode` binary alias entry in package.json.
      if (line.includes('package.json') && line.includes('"opencode"')) continue;
      violations.push(line);
    }

    if (violations.length > 0) {
      console.error(
        `Stale brand references found (${violations.length}):\n`
        + violations.slice(0, 30).join('\n'),
      );
    }
    expect(violations).toHaveLength(0);
  });
});
