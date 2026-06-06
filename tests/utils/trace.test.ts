import {describe, expect, it, beforeEach} from 'vitest';

import {clearSpans, formatTraceSummary, getRecentSpans, startSpan, trace} from '../../src/utils/trace.js';

describe('trace utilities', () => {
  beforeEach(() => clearSpans());

  it('records successful, nested, and failed spans with redaction', async () => {
    await trace('outer', async () => {
      const child = startSpan('child', {Authorization: 'Bearer secret'});
      child.end();
      await Promise.resolve();
    });
    await expect(trace('boom', async () => {
      await Promise.resolve();
      throw new Error('token=secret');
    })).rejects.toThrow('token=secret');

    const spans = getRecentSpans(3);
    expect(spans.map((span) => span.name)).toEqual(['child', 'outer', 'boom']);
    expect(spans[0]?.parentId).toBe(spans[1]?.id);
    expect(JSON.stringify(spans)).not.toContain('secret');
    expect(formatTraceSummary(spans)).toContain('FAIL boom');
  });
});
