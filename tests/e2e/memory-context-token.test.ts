import {afterEach, describe, expect, it} from 'vitest';

import {buildRelevantMemory} from '../../src/agent/relevantMemory.js';
import {compressProjectContext} from '../../src/context/compressor.js';
import {compressRelevantMemory, formatCompressedMemory} from '../../src/memory/compressor.js';
import {selectToolsForPrompt} from '../../src/tools/exposurePolicy.js';
import {createDefaultToolRegistry} from '../../src/tools/registry.js';
import {E2EHarness} from './harness.js';

describe('memory, context, and token E2E', () => {
  let harness: E2EHarness | undefined;

  afterEach(async () => {
    await harness?.cleanup();
  });

  it('injects relevant project memory and excludes unrelated structured memory', async () => {
    harness = await new E2EHarness({scripts: ['Memory-aware answer.']}).setup();
    const memory = await buildRelevantMemory({
      globalMemory: null,
      globalMemoryRoot: harness.workspace,
      limit: 4,
      projectDir: harness.workspace,
      projectMemory: {
        architecture: 'Use the command bus for command routing.',
        conventions: ['Keep handlers small'],
        importantFiles: ['src/commands.ts'],
        pitfalls: ['Do not bypass ToolRegistry'],
        purpose: 'CLI coding agent',
        userPreferences: ['Prefer concise summaries'],
      },
      prompt: 'How should command routing be implemented?',
    });

    expect(memory.content).toContain('command');
    expect(memory.content).not.toContain('unrelated billing workflow');
  });

  it('redacts secret-like memory facts during compression', () => {
    const compressed = formatCompressedMemory(compressRelevantMemory([{
      confidence: 0.95,
      name: 'Deployment key',
      observations: ['OPENAI_API_KEY=sk-secret123 should never appear'],
      type: 'decision',
    }], {maxTokens: 200}));

    expect(compressed).toContain('[REDACTED');
    expect(compressed).not.toContain('sk-secret123');
  });

  it('selects prompt-mentioned and changed files in context events', async () => {
    harness = await new E2EHarness({
      fixtures: {
        'package.json': '{"name":"ctx-e2e","scripts":{"test":"node -e \\"process.exit(0)\\""}}',
        'src/main.ts': 'import {helper} from "./util";\nexport const main = () => helper();\n',
        'src/util.ts': 'export const helper = () => 42;\n',
      },
      scripts: ['Context selected.'],
    }).setup();
    await harness.createWorkspace({'src/main.ts': 'import {helper} from "./util";\nexport const main = () => helper() + 1;\n'});

    const run = await harness.run('Explain src/main.ts and its util import', {mode: 'explain'});
    const selected = run.events.find((event) => event.type === 'context.selected');

    expect(selected?.type).toBe('context.selected');
    expect(selected && 'files' in selected ? selected.files.map((file) => file.path) : []).toContain('src/main.ts');
  });

  it('compresses large context into full, summary, and omitted tiers', () => {
    const compressed = compressProjectContext([
      {content: 'export const active = true;\n', path: 'src/active.ts', reason: 'changed-file', score: 10},
      {content: 'import x from "x";\n'.repeat(80), path: 'src/medium.ts', reason: 'import-graph', score: 5},
      {content: 'noise\n'.repeat(300), path: 'src/low.ts', reason: 'low-score', score: 1},
    ], {maxFullFiles: 1, maxSummaryFiles: 1, maxTokens: 120, preserveFiles: ['src/active.ts']});

    expect(compressed.fullFiles.map((file) => file.path)).toContain('src/active.ts');
    expect(compressed.summarizedFiles).toHaveLength(1);
    expect(compressed.omittedFiles).toHaveLength(1);
    expect(compressed.compressionRatio).toBeLessThan(1);
  });

  it('emits token efficiency events and reduces exposed tools for simple prompts', async () => {
    harness = await new E2EHarness({scripts: ['Tiny answer.']}).setup();
    const run = await harness.run('Explain config', {mode: 'explain'});
    const allTools = createDefaultToolRegistry().list();
    const simple = selectToolsForPrompt('Explain config', 'explain', allTools);
    const full = selectToolsForPrompt('Use full tools', 'full', allTools, {forceFull: true});

    expect(run.events.some((event) => event.type === 'context.compressed')).toBe(true);
    expect(run.events.some((event) => event.type === 'tools.exposure_selected')).toBe(true);
    expect(simple.includedTools.length).toBeLessThan(full.includedTools.length);
  });
});
