#!/usr/bin/env node
// Phase 18B terminal-UX smoke. Verifies the calm/compact normal-mode TUI
// contract (status line, tool cards, approval card, final summary, diff policy,
// normal-vs-debug boundary) via the pure view-models the Ink components render.
// Fully offline, deterministic, no real network or API key.
//
// Coverage:
//  1. build calculator app                        (compact tool cards)
//  2. approval card is compact and lists files
//  3. file write tool cards are compact
//  4. no huge diff in normal mode
//  5. final summary is compact / not duplicated
//  6. failure card is concise
//  7. debug mode shows full details
//  8. input footer does not spam
//  9. provider/model visible in header
// 10. waiting/approval state visible
import {execFile} from 'node:child_process';
import path from 'node:path';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');

const run = async () => {
  const {stdout} = await execFileAsync('npx', [
    'vitest',
    'run',
    'tests/e2e/terminal-ux-dogfood.test.ts',
    'tests/ui/toolCards.test.ts',
    'tests/ui/statusLine.test.ts',
    'tests/safety/approvalFormat.test.ts',
    'tests/agent/finalSummary.test.ts',
  ], {cwd: root, timeout: 180_000});
  process.stdout.write(stdout);
  process.stdout.write('\nManual Phase 18B terminal-UX smoke passed.\n');
};

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
