import {describe, expect, it} from 'vitest';
import {compressToolOutput, extractImportantLogLines} from '../../src/tools/outputCompressor.js';

describe('tool output compressor', () => {
  it('preserves errors, failing tests, paths, and redacts secrets', () => {
    const output = [
      ...Array.from({length: 200}, (_, index) => `noise line ${index}`),
      'FAIL tests/math.test.ts > adds numbers',
      'AssertionError: expected 1 to be 2',
      'at src/math.ts:12:3',
      'TOKEN=sk-secret12345',
    ].join('\n');
    const result = compressToolOutput('test_runner', output, {
      maxTokens: 80,
      preserveErrors: true,
      preserveFailingTests: true,
      preserveStackTraces: true,
    });

    expect(result.content).toContain('FAIL tests/math.test.ts');
    expect(result.content).toContain('src/math.ts:12');
    expect(result.content).not.toContain('sk-secret12345');
    expect(result.compressionRatio).toBeLessThan(1);
    expect(result.compressionReport).toContain('saved=');
  });

  it('extracts important log lines', () => {
    expect(extractImportantLogLines('ok\nError: bad\nat src/a.ts:1:2')).toEqual(['Error: bad', 'at src/a.ts:1:2']);
  });
});
