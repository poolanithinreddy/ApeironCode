import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

import {formatEvalSummary, loadLastEvalResult, saveEvalResult} from '../../src/evals/results.js';
import type {EvalRunSummary} from '../../src/evals/types.js';

const summary: EvalRunSummary = {
  durationMs: 3,
  failed: 0,
  passed: 1,
  results: [{
    durationMs: 1,
    failures: [],
    filesChanged: ['a.txt'],
    id: 'case',
    passed: true,
    tokenEfficiency: {
      estimatedContextTokens: 0,
      estimatedInputTokens: 4,
      estimatedMemoryTokens: 0,
      estimatedOutputTokens: 1,
      estimatedToolResultTokens: 0,
      estimatedToolSchemaTokens: 2,
      successPer1kTokens: 142.857,
      toolCallsPer1kTokens: 0,
      totalEstimatedTokens: 7,
    },
    toolCalls: [],
  }],
  suiteId: 'smoke',
  tokenEfficiency: {
    estimatedContextTokens: 0,
    estimatedInputTokens: 4,
    estimatedMemoryTokens: 0,
    estimatedOutputTokens: 1,
    estimatedToolResultTokens: 0,
    estimatedToolSchemaTokens: 2,
    successPer1kTokens: 142.857,
    toolCallsPer1kTokens: 0,
    totalEstimatedTokens: 7,
  },
  total: 1,
};

describe('eval results', () => {
  it('saves, loads, formats, and redacts secrets', async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-eval-results-'));
    await saveEvalResult({
      ...summary,
      results: [{...summary.results[0]!, failures: ['token ghp_secret123 should hide']}],
    }, outputDir);

    const loaded = await loadLastEvalResult('smoke', outputDir);
    expect(loaded?.suiteId).toBe('smoke');
    const formatted = formatEvalSummary(loaded);
    expect(formatted).toContain('Eval Suite: smoke');
    expect(formatted).toContain('Token Efficiency');
    expect(formatted).not.toContain('ghp_secret123');
    expect(await loadLastEvalResult('missing', outputDir)).toBeNull();
    await fs.rm(outputDir, {force: true, recursive: true});
  });
});
