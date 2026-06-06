import {describe, expect, it} from 'vitest';
import {compressProjectContext, dedupeContextBlocks, summarizeFileForContext} from '../../src/context/compressor.js';

describe('context compressor', () => {
  it('keeps important files full, summarizes medium files, and omits low-priority files', () => {
    const big = 'import x from "x";\nexport function run() {}\n'.repeat(20);
    const result = compressProjectContext([
      {content: big, path: 'src/active.ts', reason: 'changed-file', score: 0.1},
      {content: big, path: 'src/mid.ts', reason: 'name-match', score: 0.8},
      {content: big, path: 'src/low.ts', reason: 'low', score: 0.01},
    ], {maxFullFiles: 1, maxSummaryFiles: 1, maxTokens: 1_200, preserveFiles: ['src/active.ts']});

    expect(result.fullFiles.map((file) => file.path)).toContain('src/active.ts');
    expect(result.summarizedFiles).toHaveLength(1);
    expect(result.omittedFiles).toHaveLength(1);
    expect(result.compressionRatio).toBeLessThan(1);
  });

  it('summarizes code symbols and dedupes blocks', () => {
    expect(summarizeFileForContext('a.ts', 'import z from "z";\nexport interface User {}\n// TODO fix\n', {maxTokens: 80})).toContain('User');
    expect(dedupeContextBlocks(['same', 'same  ', 'different'])).toEqual(['same', 'different']);
  });
});
