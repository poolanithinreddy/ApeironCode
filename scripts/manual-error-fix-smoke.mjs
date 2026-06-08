#!/usr/bin/env node
// Low-credit dogfood: exercises pasted-error debugging end to end with a
// fake provider and a temp workspace — NO network, NO API credits.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');

const run = async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-error-fix-'));
  try {
    // Scenarios: error paste intent parsing, deterministic search,
    // search→read→fix-plan→approve→patch flow, command_output exposure
    // guard, and the normal-vs-debug (verbose) summary gating.
    const {stdout} = await execFileAsync('npx', [
      'vitest',
      'run',
      'tests/agent/errorPasteIntent.test.ts',
      'tests/agent/errorFixRuntime.test.ts',
      'tests/e2e/error-fix-dogfood.test.ts',
      'tests/tools/exposurePolicy.test.ts',
    ], {cwd: root, timeout: 120_000});
    process.stdout.write(stdout);
    process.stdout.write(`\nManual error-fix smoke passed in ${tmp}\n`);
  } finally {
    await fs.rm(tmp, {force: true, recursive: true});
  }
};

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
