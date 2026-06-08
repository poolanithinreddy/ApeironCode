/**
 * Tests for bridge session command routing and validation.
 */

import {describe, it, expect} from 'vitest';
import {
  validateSendPromptPayload,
  validateSessionStartPayload,
  validateSessionStopPayload,
  buildPromptWithContext,
  formatBridgeCommandError,
} from '../../src/bridge/commands.js';

describe('validateSendPromptPayload', () => {
  it('rejects empty prompt', () => {
    const r = validateSendPromptPayload({prompt: '', cwd: '/tmp'});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_PROMPT');
  });

  it('rejects whitespace-only prompt', () => {
    const r = validateSendPromptPayload({prompt: '   ', cwd: '/tmp'});
    expect(r.ok).toBe(false);
  });

  it('accepts valid prompt', () => {
    const r = validateSendPromptPayload({prompt: 'hello world', cwd: '/tmp'});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.prompt).toBe('hello world');
  });

  it('rejects huge prompt', () => {
    const r = validateSendPromptPayload({prompt: 'x'.repeat(33_000), cwd: '/tmp'});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('PROMPT_TOO_LARGE');
  });

  it('uses process.cwd() when cwd missing', () => {
    const r = validateSendPromptPayload({prompt: 'hi'});
    expect(r.ok).toBe(true);
    if (r.ok) expect(typeof r.value.cwd).toBe('string');
  });

  it('preserves sessionId when provided', () => {
    const r = validateSendPromptPayload({prompt: 'hi', cwd: '/tmp', sessionId: 'abc-123'});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.sessionId).toBe('abc-123');
  });

  it('caps selectedText in selected context', () => {
    const ctx = {filePath: '/src/file.ts', selectedText: 'a'.repeat(9000)};
    const r = validateSendPromptPayload({prompt: 'hi', cwd: '/tmp', selectedContext: ctx});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.selectedContext?.selectedText?.length).toBeLessThanOrEqual(8_001);
    }
  });

  it('redacts secrets in prompt', () => {
    const r = validateSendPromptPayload({
      prompt: 'use API_KEY=sk-abc123secret for this task',
      cwd: '/tmp',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.prompt).not.toContain('sk-abc123secret');
    }
  });

  it('handles missing selectedContext gracefully', () => {
    const r = validateSendPromptPayload({prompt: 'hi', cwd: '/tmp', selectedContext: null});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.selectedContext).toBeUndefined();
  });
});

describe('validateSessionStartPayload', () => {
  it('accepts cwd', () => {
    const r = validateSessionStartPayload({cwd: '/home/user/proj'});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.cwd).toBe('/home/user/proj');
  });

  it('uses process.cwd() when cwd missing', () => {
    const r = validateSessionStartPayload({});
    expect(r.ok).toBe(true);
    if (r.ok) expect(typeof r.value.cwd).toBe('string');
  });
});

describe('validateSessionStopPayload', () => {
  it('rejects missing sessionId', () => {
    const r = validateSessionStopPayload({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MISSING_SESSION_ID');
  });

  it('accepts valid sessionId', () => {
    const r = validateSessionStopPayload({sessionId: 'abc-123'});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.sessionId).toBe('abc-123');
  });
});

describe('buildPromptWithContext', () => {
  it('returns prompt unchanged when no context', () => {
    expect(buildPromptWithContext('hello')).toBe('hello');
  });

  it('prepends context header when context provided', () => {
    const result = buildPromptWithContext('fix this', {
      filePath: '/src/foo.ts',
      workspaceRelativePath: 'src/foo.ts',
      languageId: 'typescript',
      lineStart: 10,
      lineEnd: 20,
      selectedText: 'const x = 1;',
    });
    expect(result).toContain('[Context: src/foo.ts (typescript) lines 10–20]');
    expect(result).toContain('const x = 1;');
    expect(result).toContain('fix this');
  });

  it('omits selected text when missing', () => {
    const result = buildPromptWithContext('describe', {
      filePath: '/src/bar.ts',
    });
    expect(result).toContain('[Context: /src/bar.ts]');
    expect(result).not.toContain('```');
  });
});

describe('formatBridgeCommandError', () => {
  it('returns a bridge error message', () => {
    const msg = formatBridgeCommandError('TEST_ERROR', 'something went wrong');
    expect(msg.type).toBe('bridge.error');
    expect(msg.payload['message']).toContain('something went wrong');
  });

  it('redacts recognized secret patterns in error messages', () => {
    const secret = 'sk-abcdefghijklmnopqrstuvwxyz0123456789ABCDEF';
    const msg = formatBridgeCommandError('ERR', `token=${secret}`);
    const text = JSON.stringify(msg);
    expect(text).not.toContain(secret);
  });
});
