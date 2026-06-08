#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');

const run = async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-real-coding-'));
  try {
    // Scenarios: inspect + create folder, pending-instruction continuation,
    // modify existing web app, add task notes, run-app explanation, command
    // approval, invalid tool-arg failures (no wrong-tool error, no loop),
    // Next.js todo build with incomplete first plan → acceptance repair,
    // build/run/fix command resolution, app-incomplete complaint repair.
    const {stdout} = await execFileAsync('npx', [
      'vitest',
      'run',
      'tests/e2e/real-coding-agent-flow.test.ts',
      'tests/e2e/core-dogfood-flow.test.ts',
      'tests/e2e/app-completion-dogfood.test.ts',
      'tests/agent/codingOrchestrator.test.ts',
      'tests/agent/featureAcceptance.test.ts',
      'tests/agent/runAppRuntime.test.ts',
      'tests/agent/toolExecutionContract.test.ts',
      'tests/agent/pendingInstruction.test.ts',
      'tests/agent/requestDecomposition.test.ts',
    ], {cwd: root, timeout: 180_000});
    process.stdout.write(stdout);
    process.stdout.write(`\nManual real-coding smoke passed in ${tmp}\n`);
  } finally {
    await fs.rm(tmp, {force: true, recursive: true});
  }
};

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
