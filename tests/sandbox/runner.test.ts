import {describe, expect, it} from 'vitest';

import {BaseSandboxRunner} from '../../src/sandbox/runner.js';

describe('SandboxRunner', () => {
  it('BaseSandboxRunner normalizes output correctly', () => {
    class TestRunner extends BaseSandboxRunner {
      readonly backend = 'docker' as const;

      // eslint-disable-next-line @typescript-eslint/require-await
      async run() {
        return {
          ok: true,
          exitCode: 0,
          stdout: 'test\r\noutput\r\n',
          stderr: '',
          durationMs: 100,
          backend: 'docker' as const,
        };
      }
    }

    const runner = new TestRunner();
    const normalized = runner['normalizeOutput']('hello\r\nworld\r\n');
    expect(normalized).toBe('hello\nworld');
  });

  it('normalizeOutput trims trailing whitespace', () => {
    class TestRunner extends BaseSandboxRunner {
      readonly backend = 'docker' as const;

      // eslint-disable-next-line @typescript-eslint/require-await
      async run() {
        return {
          ok: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
          durationMs: 0,
          backend: 'docker' as const,
        };
      }
    }

    const runner = new TestRunner();
    const normalized = runner['normalizeOutput']('test output  \n  \n');
    expect(normalized).toBe('test output');
  });
});
