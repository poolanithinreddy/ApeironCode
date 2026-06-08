import fs from 'node:fs/promises';
import path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

import {listCheckpoints} from '../../src/agent/checkpoints.js';
import {E2EHarness, toolChunks} from './harness.js';

describe('runtime reliability E2E', () => {
  let harness: E2EHarness | undefined;

  afterEach(async () => {
    await harness?.cleanup();
  });

  it('emits runtime events and checkpoints before risky edits', async () => {
    harness = await new E2EHarness({
      fixtures: {'src/value.ts': 'export const value = 1;\n'},
      scripts: [
        toolChunks('edit_file', {path: 'src/value.ts', search: 'value = 1', replace: 'value = 2'}),
        'Edited safely.',
      ],
    }).setup();
    const run = await harness.run('Edit src/value.ts safely', {mode: 'edit'});

    expect(run.events.some((event) => event.type === 'runtime.state_changed')).toBe(true);
    expect(run.events.some((event) => event.type === 'runtime.checkpoint_created')).toBe(true);
    expect(await listCheckpoints(harness.workspace)).toHaveLength(1);
    await harness.assertFileContains('src/value.ts', 'value = 2');
  });

  it('rolls back an edit after failing verification', async () => {
    harness = await new E2EHarness({
      fixtures: {
        'package.json': '{"scripts":{"test":"node test.js"}}',
        'src/value.js': 'exports.value = 1;\n',
        'test.js': 'process.exit(1);\n',
      },
      scripts: [
        toolChunks('edit_file', {path: 'src/value.js', search: 'value = 1', replace: 'value = 2'}),
        toolChunks('test_runner', {command: 'node test.js'}),
        'Verification failed and rollback was applied.',
      ],
    }).setup();
    const run = await harness.run('Edit then verify and rollback if tests fail', {mode: 'fix'});

    expect(run.events.some((event) => event.type === 'runtime.rollback_started')).toBe(true);
    expect(run.events.some((event) => event.type === 'runtime.rollback_completed')).toBe(true);
    await harness.assertFileContains('src/value.js', 'value = 1');
  });

  it('recovers from command failure and stops repeated failure gracefully', async () => {
    harness = await new E2EHarness({
      scripts: [
        toolChunks('run_command', {command: 'node -e "process.exit(1)"'}),
        toolChunks('run_command', {command: 'node -e "process.exit(1)"'}),
        'Stopped safely.',
      ],
    }).setup();
    const run = await harness.run('Try a failing command twice and stop', {mode: 'debug'});

    expect(run.toolCalls.filter((toolCall) => toolCall.toolName === 'run_command')).toHaveLength(2);
    expect(run.events.some((event) => event.type === 'runtime.recovery_started')).toBe(true);
    expect(run.result.finalMessage.content).toContain('Stopped safely');
  });

  it('does not leak secrets in runtime event snapshots', async () => {
    harness = await new E2EHarness({
      scripts: [toolChunks('run_command', {command: 'node -e "console.log(process.env.SECRET)"'}), 'Done.'],
    }).setup();
    await harness.run('Run command with token=secret123 in prompt', {mode: 'debug'});

    const serialized = JSON.stringify(harness.events.filter((event) => event.type.startsWith('runtime.')));
    expect(serialized).not.toContain('secret123');
  });

  it('restores checkpoint through the checkpoint API', async () => {
    harness = await new E2EHarness({fixtures: {'a.txt': 'before\n'}, scripts: ['ok']}).setup();
    const {createCheckpoint, restoreCheckpoint} = await import('../../src/agent/checkpoints.js');
    const checkpoint = await createCheckpoint(harness.workspace);

    await fs.writeFile(path.join(harness.workspace, 'a.txt'), 'after\n');
    await restoreCheckpoint(checkpoint);

    await harness.assertFileContains('a.txt', 'before');
  });
});
