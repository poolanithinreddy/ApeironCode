import {afterEach, describe, expect, it} from 'vitest';
import {z} from 'zod';

import {E2EHarness, toolChunks} from './harness.js';
import {createDefaultToolRegistry} from '../../src/tools/registry.js';
import {defineTool} from '../../src/tools/types.js';

describe('Token Efficiency 2.0 E2E', () => {
  let harness: E2EHarness | undefined;

  afterEach(async () => {
    await harness?.cleanup();
  });

  it('compacts long history and records token events', async () => {
    const longAnswer = 'status '.repeat(800);
    harness = await new E2EHarness({scripts: [longAnswer, longAnswer, longAnswer, longAnswer, longAnswer]}).setup();
    await harness.run('First turn with a very long prompt that keeps a lot of conversational state in play '.repeat(20), {mode: 'chat'});
    await harness.run('Second turn with the same large working set '.repeat(20), {mode: 'chat'});
    await harness.run('Third turn with more accumulated history '.repeat(20), {mode: 'chat'});
    await harness.run('Fourth turn with still more repeated state '.repeat(20), {mode: 'chat'});
    const run = await harness.run('Continue with the same task', {mode: 'chat'});
    expect(run.events.some((event) => event.type === 'token.history_compacted')).toBe(true);
    expect(run.events.some((event) => event.type === 'token.ledger_updated')).toBe(true);
  });

  it('reuses context as a delta and avoids irrelevant tools on simple prompts', async () => {
    harness = await new E2EHarness({
      fixtures: {'src/a.ts': 'export const a = 1;\n', 'src/b.ts': 'export const b = 2;\n'},
      scripts: ['explain one', 'explain two'],
    }).setup();
    await harness.run('Explain src/a.ts briefly', {mode: 'explain'});
    const run = await harness.run('Explain src/a.ts briefly', {mode: 'explain'});
    expect(run.events.some((event) => event.type === 'token.context_delta_used')).toBe(true);
    const exposure = run.events.find((event) => event.type === 'tools.exposure_selected');
    expect(exposure && 'includedTools' in exposure ? exposure.includedTools : []).not.toContain('write_file');
  });

  it('compresses large tool output before feeding it back to the model', async () => {
    const toolRegistry = createDefaultToolRegistry();
    toolRegistry.add(defineTool({
      description: 'Emit a large synthetic log',
      inputSchema: z.object({}),
      name: 'big_output',
      requiresApproval: false,
      riskLevel: 'low',
      run: () => Promise.resolve({
        ok: true,
        output: Array.from({length: 1200}, (_, i) => `line ${i} sk-very-secret-token-1234567890`).join('\n'),
        summary: 'generated big output',
      }),
    }));
    harness = await new E2EHarness({
      toolRegistry,
      scripts: [
        toolChunks('big_output', {}),
        'done',
      ],
    }).setup();
    const run = await harness.run('Run the command and inspect the failure output', {mode: 'debug'});
    expect(run.events.some((event) => event.type === 'tool_output.compressed' || event.type === 'token.tool_output_compressed')).toBe(true);
    expect(JSON.stringify(run.events)).not.toContain('sk-secret');
  });
});
