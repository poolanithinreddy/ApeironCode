import {describe, expect, it} from 'vitest';
import {
  extractFailureSignals,
  formatFailureSignals,
  mapFailuresToFiles,
} from '../../src/context/failureMapper.js';

describe('extractFailureSignals', () => {
  it('parses TypeScript compiler errors', () => {
    const out = `src/foo.ts:42:7 - error TS2322: Type 'string' is not assignable to type 'number'.\n`;
    const signals = extractFailureSignals(out);
    const ts = signals.find((s) => s.source === 'typescript');
    expect(ts?.file).toBe('src/foo.ts');
    expect(ts?.line).toBe(42);
    expect(ts?.message).toContain('not assignable');
  });

  it('parses ESLint-style errors', () => {
    const out = `src/foo.ts:10:5  error  Unexpected console statement\n`;
    expect(extractFailureSignals(out).some((s) => s.source === 'lint')).toBe(true);
  });

  it('parses Vitest/Jest FAIL lines and stack traces', () => {
    const out = [
      'FAIL src/foo.test.ts > computesTotal',
      '  AssertionError: expected 1 to equal 2',
      '  at run (src/foo.test.ts:13:5)',
    ].join('\n');
    const signals = extractFailureSignals(out);
    expect(signals.some((s) => s.source === 'test' && s.testName?.includes('computesTotal'))).toBe(true);
    expect(signals.some((s) => s.source === 'runtime' && s.line === 13)).toBe(true);
  });

  it('parses pytest FAILED entries', () => {
    const out = `FAILED tests/test_app.py::test_login\n`;
    const signals = extractFailureSignals(out);
    expect(signals.some((s) => s.source === 'test' && s.file === 'tests/test_app.py')).toBe(true);
  });

  it('parses go --- FAIL', () => {
    const signals = extractFailureSignals('--- FAIL: TestLogin (0.05s)\n');
    expect(signals.some((s) => s.testName === 'TestLogin')).toBe(true);
  });

  it('parses java stack frames', () => {
    const signals = extractFailureSignals('  at com.acme.Foo.bar(Foo.java:10)\n');
    expect(signals.some((s) => s.file === 'Foo.java' && s.line === 10)).toBe(true);
  });
});

describe('mapFailuresToFiles', () => {
  it('aggregates confidence per known file', () => {
    const out = `src/foo.ts:42:7 - error TS2322: bad\n  at run (src/foo.ts:13:5)\n`;
    const score = mapFailuresToFiles(out, ['src/foo.ts'], '.');
    expect(score.get('src/foo.ts')).toBeGreaterThan(0.9);
  });

  it('tolerates unknown files gracefully', () => {
    const out = `src/missing.ts:1:1 - error TS1: nope\n`;
    const score = mapFailuresToFiles(out, ['src/foo.ts'], '.');
    expect(score.size).toBe(0);
  });
});

describe('formatFailureSignals', () => {
  it('renders or reports none', () => {
    expect(formatFailureSignals([])).toContain('No failure');
    const text = formatFailureSignals([
      {confidence: 1, file: 'a.ts', line: 1, message: 'm', source: 'typescript'},
    ]);
    expect(text).toContain('typescript');
    expect(text).toContain('a.ts:1');
  });
});
