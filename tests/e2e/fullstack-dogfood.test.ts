/**
 * Phase 18A full-stack / larger-project dogfood.
 *
 * A full-stack prompt must classify as build_full_stack_app and, rather than
 * emitting one giant fragile file dump, produce a phased build plan and write
 * NO files until the user approves phase 1. Scripted provider, no network.
 */
import {afterEach, describe, expect, it} from 'vitest';

import {E2EHarness} from './harness.js';
import {classifyCodingIntent} from '../../src/agent/codingIntent.js';

const FULLSTACK_PROMPT =
  'Create a full-stack task manager with a React frontend, Express backend, REST API, local SQLite persistence, clean premium UI, and run instructions.';

describe('Phase 18A full-stack dogfood', () => {
  let harness: E2EHarness | undefined;
  afterEach(async () => {
    await harness?.cleanup();
    harness = undefined;
  });

  it('classifies a full-stack prompt as build_full_stack_app', () => {
    const intent = classifyCodingIntent(FULLSTACK_PROMPT);
    expect(intent.kind).toBe('build_full_stack_app');
    expect(intent.requiresFileWrites).toBe(true);
    expect(intent.requiresCommands).toBe(true);
  });

  it('produces a phased plan and writes no files before approval', async () => {
    const plan = [
      'Stack: React (client/) + Express (server/) + SQLite.',
      'Phase 1: scaffold package.json scripts and folders.',
      'Phase 2: Express REST API (server/index.js) + SQLite persistence.',
      'Phase 3: React frontend (client/) consuming the API.',
      'Phase 4: validation + run instructions (npm run dev).',
    ].join('\n');
    harness = await new E2EHarness({scripts: [plan]}).setup();
    const run = await harness.run(FULLSTACK_PROMPT);

    expect(run.providerCalls.length).toBeGreaterThanOrEqual(1);
    // No silent file writes for a large scaffold — the response is a phased
    // plan, not a giant one-shot file dump.
    expect(run.toolCalls.some((c) => c.toolName === 'write_file')).toBe(false);
    expect(run.filesChanged).toEqual([]);
    expect(run.result.finalMessage.content).toMatch(/Phase 1/i);
    expect(run.result.finalMessage.content).toMatch(/server\/|Express|backend/i);
    expect(run.result.finalMessage.content).toMatch(/client\/|React|frontend/i);
  });
});
