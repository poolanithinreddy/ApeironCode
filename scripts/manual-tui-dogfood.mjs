#!/usr/bin/env node
// Phase 17G TUI/interactive-input dogfood smoke. Runs the InputBox unit
// tests plus the 17G dogfood scenarios so the multi-line truncation and
// detailed-prompt routing regressions cannot silently come back.
//
// We cannot drive a real TTY from here, so the InputBox helpers are tested
// at the function boundary (extractSubmittedInput) where the bug lived.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');

const run = async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-tui-dogfood-'));
  try {
    const {stdout} = await execFileAsync('npx', [
      'vitest',
      'run',
      'tests/ui/inputBox.test.ts',
      'tests/e2e/real-dogfood-17g.test.ts',
    ], {cwd: root, timeout: 120_000});
    process.stdout.write(stdout);
    process.stdout.write(`\nManual TUI dogfood smoke passed in ${tmp}\n`);
  } finally {
    await fs.rm(tmp, {force: true, recursive: true});
  }
};

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
