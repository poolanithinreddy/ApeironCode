import {describe, expect, it} from 'vitest';

import {
  formatToolResultForModel,
  formatToolResultForUser,
  normalizeToolResult,
  redactSecrets,
  validateToolResultContract,
} from '../../src/tools/resultContract.js';

describe('normalizeToolResult', () => {
  it('normalizes successful result', () => {
    const r = normalizeToolResult('read_file', {ok: true, summary: 'read', output: 'content'});
    expect(r.ok).toBe(true);
    expect(r.severity).toBe('info');
    expect(r.truncated).toBe(false);
  });

  it('marks failed result as error severity', () => {
    const r = normalizeToolResult('test_runner', {ok: false, summary: 'tests failed', output: 'FAIL test1'});
    expect(r.severity).toBe('error');
  });

  it('preserves exitCode from metadata', () => {
    const r = normalizeToolResult('run_command', {ok: false, summary: 'cmd', output: '', metadata: {exitCode: 2}});
    expect(r.exitCode).toBe(2);
  });

  it('compresses large output', () => {
    const big = 'x'.repeat(8000);
    const r = normalizeToolResult('run_command', {ok: true, summary: 'big', output: big});
    expect(r.truncated).toBe(true);
    expect(r.output.length).toBeLessThan(big.length);
  });

  it('preserves failing test lines in compressed output', () => {
    const filler = 'noise\n'.repeat(2000);
    const failingLine = 'FAIL src/foo.test.ts > something failed badly';
    const big = `${filler}${failingLine}\n${filler}`;
    const r = normalizeToolResult('test_runner', {ok: false, summary: 'failed', output: big});
    expect(r.truncated).toBe(true);
    expect(r.output).toContain(failingLine);
  });

  it('redacts long bearer tokens', () => {
    const longToken = `Bearer ${'a'.repeat(40)}`;
    const r = normalizeToolResult('web_fetch', {ok: true, summary: 'ok', output: `Authorization: ${longToken}`});
    expect(r.output).not.toContain(longToken);
    expect(r.output).toContain('REDACTED');
  });
});

describe('redactSecrets', () => {
  it('redacts AWS keys', () => {
    const out = redactSecrets('AKIAIOSFODNN7EXAMPLE');
    expect(out).toContain('REDACTED_AWS_KEY');
  });
  it('redacts OpenAI keys', () => {
    const out = redactSecrets(`sk-${'a'.repeat(40)}`);
    expect(out).toContain('REDACTED_OPENAI_KEY');
  });
  it('redacts password=value', () => {
    const out = redactSecrets('password=supersecretvalue123');
    expect(out).toContain('REDACTED');
    expect(out).not.toContain('supersecretvalue123');
  });
});

describe('validateToolResultContract', () => {
  it('flags missing fields', () => {
    const issues = validateToolResultContract('read_file', {});
    expect(issues.length).toBeGreaterThan(0);
  });
  it('passes for valid result', () => {
    expect(validateToolResultContract('read_file', {ok: true, summary: 's', output: 'o'})).toEqual([]);
  });
});

describe('format functions', () => {
  it('formatToolResultForModel includes severity and summary', () => {
    const norm = normalizeToolResult('read_file', {ok: true, summary: 'done', output: 'data'});
    const out = formatToolResultForModel(norm);
    expect(out).toContain('INFO');
    expect(out).toContain('done');
  });

  it('formatToolResultForUser shows OK/FAIL indicator', () => {
    const ok = normalizeToolResult('x', {ok: true, summary: 's', output: ''});
    const bad = normalizeToolResult('x', {ok: false, summary: 's', output: ''});
    expect(formatToolResultForUser(ok)).toContain('[OK]');
    expect(formatToolResultForUser(bad)).toContain('[FAIL]');
  });
});
