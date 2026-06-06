#!/usr/bin/env node
// Phase 18A master dogfood smoke. Runs the full 18A dogfood surface plus the
// inherited 17F/17G flows in one command, end-to-end through the real
// Agent.run() path on temp workspaces via ScriptedStreamingProvider. No real
// network, no real API key, deterministic.
//
// Coverage:
//  1. multiline prompt preservation              (real-dogfood-18a)
//  2. static calculator build                    (core-dogfood-flow)
//  3. premium visual repair / browser smoke       (browser-smoke-dogfood)
//  4. nested app linked-file detection            (real-dogfood-18a / staticAppEntry)
//  5. read package.json                           (real-dogfood-17f)
//  6. pasted error fix                            (error-fix-dogfood)
//  7. Next.js todo build/repair                   (app-completion-dogfood)
//  8. full-stack app scaffold                     (fullstack-dogfood)
//  9. run/build/fix                               (app-completion-dogfood)
// 10. normal output compactness / honest smoke    (browser-smoke-dogfood)
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');

const run = async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-master-dogfood-18a-'));
  try {
    const {stdout} = await execFileAsync('npx', [
      'vitest',
      'run',
      'tests/e2e/real-dogfood-18a.test.ts',
      'tests/e2e/browser-smoke-dogfood.test.ts',
      'tests/e2e/fullstack-dogfood.test.ts',
      'tests/e2e/core-dogfood-flow.test.ts',
      'tests/e2e/app-completion-dogfood.test.ts',
      'tests/e2e/error-fix-dogfood.test.ts',
      'tests/e2e/real-dogfood-17f.test.ts',
      'tests/e2e/real-dogfood-17g.test.ts',
      'tests/e2e/terminal-ux-dogfood.test.ts',
      'tests/agent/browserSmokeRuntime.test.ts',
      'tests/agent/visualAcceptance.test.ts',
      'tests/agent/staticAppEntry.test.ts',
      'tests/agent/filePlanExecutor.test.ts',
    ], {cwd: root, timeout: 240_000});
    process.stdout.write(stdout);
    process.stdout.write(`\nManual Phase 18A master dogfood smoke passed in ${tmp}\n`);
  } finally {
    await fs.rm(tmp, {force: true, recursive: true});
  }
};

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
