import {describe, expect, it} from 'vitest';
import {chooseReasoningStyle, formatReasoningInstruction} from '../../src/agent/reasoningStyle.js';

describe('reasoning style policy', () => {
  it('chooses fast, balanced, and deep styles', () => {
    expect(chooseReasoningStyle('explain this', 'explain')).toBe('fast');
    expect(chooseReasoningStyle('implement a normal feature', 'feature')).toBe('balanced');
    expect(chooseReasoningStyle('plan a large architecture migration', 'feature')).toBe('deep');
    expect(formatReasoningInstruction('fast')).toContain('concise');
  });
});
