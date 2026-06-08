#!/usr/bin/env node
// Phase 17F real-dogfood smoke. Runs the focused dogfood test that exercises
// the full Agent.run() path through ScriptedStreamingProvider on a temp
// workspace. No real network, no real API key, deterministic.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');

const run = async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-dogfood-17f-'));
  try {
    const {stdout} = await execFileAsync('npx', [
      'vitest',
      'run',
      'tests/e2e/real-dogfood-17f.test.ts',
      'tests/e2e/real-dogfood-17g.test.ts',
      // Pull in the broader dogfood suites too so the smoke is one command.
      'tests/e2e/core-dogfood-flow.test.ts',
      'tests/e2e/app-completion-dogfood.test.ts',
      'tests/e2e/error-fix-dogfood.test.ts',
      'tests/e2e/simple-action-runtime.test.ts',
    ], {cwd: root, timeout: 240_000});
    process.stdout.write(stdout);
    process.stdout.write(`\nManual Phase 17F dogfood smoke passed in ${tmp}\n`);
  } finally {
    await fs.rm(tmp, {force: true, recursive: true});
  }
};

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
