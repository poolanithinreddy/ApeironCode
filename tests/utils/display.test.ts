import {describe, expect, it} from 'vitest';

import {formatPromptText, formatUnknownError, toDisplayString} from '../../src/utils/display.js';

describe('display formatting', () => {
  it('renders plain strings without changes', () => {
    expect(toDisplayString('hello')).toBe('hello');
    expect(formatPromptText('world')).toBe('world');
  });

  it('renders object values as structured JSON instead of [object Object]', () => {
    const output = toDisplayString({mode: 'review', reason: {kind: 'prompt'}});

    expect(output).toContain('"mode": "review"');
    expect(output).not.toContain('[object Object]');
  });

  it('renders circular objects without throwing', () => {
    const value: {name: string; self?: unknown} = {name: 'loop'};
    value.self = value;

    const output = toDisplayString(value);
    expect(output).toContain('"self": "[Circular]"');
  });

  it('uses readable error messages for unknown errors', () => {
    expect(formatUnknownError(new Error('boom'))).toBe('boom');
    expect(formatUnknownError({message: 'structured failure', meta: {code: 7}})).toBe('structured failure');
    expect(formatUnknownError({phase: 'doctor'})).toContain('"phase": "doctor"');
  });
});