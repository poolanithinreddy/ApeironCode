import {describe, it, expect} from 'vitest';
import {compressCiLog, parseCiFailureLog, formatParsedFailure, mapArtifactMetadata} from '../../src/githubAutomation/ciLogParser.js';

describe('compressCiLog', () => {
  it('drops install noise and progress bars', () => {
    const raw = [
      'npm warn deprecated foo@1.0',
      'npm notice please update',
      'added 250 packages, and audited 251 packages in 2s',
      '23 vulnerabilities (1 high, 22 low)',
      '> opencode-agent@0.1.0 test',
      '[32mrunning tests[0m',
    ].join('\n');
    const compressed = compressCiLog(raw);
    expect(compressed).not.toMatch(/npm warn|npm notice|added \d+ packages|vulnerabilities/);
    expect(compressed).toContain('running tests');
  });

  it('collapses repeated lines', () => {
    const raw = ['boom', 'boom', 'boom', 'boom', 'next'].join('\n');
    const compressed = compressCiLog(raw);
    expect(compressed).toMatch(/repeated 4x/);
    expect(compressed).toContain('next');
  });
});

describe('parseCiFailureLog', () => {
  it('extracts failing tests, assertions, file paths, and stack frames', () => {
    const raw = `
$ npm test
FAIL src/foo.test.ts > addsTwoNumbers
AssertionError: expected 2 to equal 3
  at Object.<anonymous> (src/foo.test.ts:42:15)
  at process._tickCallback (internal/process/next_tick.js:68:7)
✗ multiplyHandlesZero
Expected: 0
Received: 1
`;
    const parsed = parseCiFailureLog(raw);
    expect(parsed.failingTests.length).toBeGreaterThan(0);
    expect(parsed.failingTests.some((t) => t.includes('addsTwoNumbers'))).toBe(true);
    expect(parsed.rawAssertions.length).toBeGreaterThan(0);
    expect(parsed.filePaths.some((p) => p.file.includes('foo.test.ts') && p.line === 42)).toBe(true);
    expect(parsed.stackFrames.length).toBeGreaterThan(0);
    expect(parsed.command).toContain('npm test');
  });

  it('preserves details after compressing noisy logs', () => {
    const raw = [
      'npm warn deprecated foo',
      'npm warn deprecated foo',
      'npm warn deprecated foo',
      'FAIL src/bar.test.ts > criticalBehavior',
      'AssertionError: nope',
    ].join('\n');
    const parsed = parseCiFailureLog(raw);
    expect(parsed.failingTests.some((t) => t.includes('criticalBehavior'))).toBe(true);
    expect(parsed.rawAssertions.length).toBeGreaterThan(0);
  });

  it('formatParsedFailure produces compact deterministic output', () => {
    const parsed = parseCiFailureLog('FAIL src/x.test.ts > cool\nAssertionError: bad');
    const out = formatParsedFailure(parsed);
    expect(out).toContain('Failing tests:');
    expect(out).toContain('cool');
  });

  it('mapArtifactMetadata normalizes raw GitHub artifact response', () => {
    const out = mapArtifactMetadata({id: 7, name: 'logs', size_in_bytes: 1234, expired: false, archive_download_url: 'https://x', expires_at: '2030'});
    expect(out.id).toBe(7);
    expect(out.archiveSizeBytes).toBe(1234);
    expect(out.url).toBe('https://x');
  });
});
