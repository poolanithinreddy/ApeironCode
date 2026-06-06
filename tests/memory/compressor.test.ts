import {describe, expect, it} from 'vitest';
import {compressRelevantMemory, dedupeMemoryFacts, formatCompressedMemory} from '../../src/memory/compressor.js';

describe('memory compressor', () => {
  it('dedupes, redacts secrets, and keeps compact decision bullets', () => {
    const compressed = compressRelevantMemory([
      {confidence: 0.95, name: 'Use ToolRegistry', observations: ['Do not bypass tools'], source: 'project', type: 'decision'},
      {confidence: 0.95, name: 'Use ToolRegistry', observations: ['Do not bypass tools'], source: 'project', type: 'decision'},
      {confidence: 0.9, name: 'OPENAI_API_KEY=sk-secret12345', observations: ['secret'], type: 'convention'},
      {confidence: 0.3, name: 'old stale thing', stale: true, type: 'decision'},
    ], {maxTokens: 100});

    const formatted = formatCompressedMemory(compressed);
    expect(formatted).toContain('Decision: Use ToolRegistry');
    expect(formatted).toContain('[REDACTED_SECRET]');
    expect(formatted).not.toContain('sk-secret12345');
    expect(compressed.omittedCount).toBeGreaterThan(0);
  });

  it('dedupes equivalent facts', () => {
    expect(dedupeMemoryFacts(['Decision: A thing', 'decision a thing', 'Risk: B'])).toEqual(['Decision: A thing', 'Risk: B']);
  });
});
