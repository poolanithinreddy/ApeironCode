import {describe, expect, it} from 'vitest';

import {nativeToolCallingSuite} from '../../src/evals/suites/nativeToolCalling.js';

describe('nativeToolCallingSuite', () => {
  it('has id "native-tool-calling"', () => {
    expect(nativeToolCallingSuite.id).toBe('native-tool-calling');
  });

  it('contains 16 cases', () => {
    expect(nativeToolCallingSuite.cases).toHaveLength(16);
  });

  it('every case has unique id and description', () => {
    const ids = new Set<string>();
    for (const c of nativeToolCallingSuite.cases) {
      expect(c.id).toBeTruthy();
      expect(c.description).toBeTruthy();
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
    }
  });
});
