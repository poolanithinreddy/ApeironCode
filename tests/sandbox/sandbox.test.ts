import {describe, expect, it} from 'vitest';

import {detectSandboxStatus} from '../../src/sandbox/detector.js';
import {formatSandboxStatus} from '../../src/sandbox/format.js';

describe('sandbox status', () => {
  it('formats optional backend availability and explicit limitations', async () => {
    const status = await detectSandboxStatus(async (command) => await Promise.resolve({
      exitCode: command === 'docker' ? 0 : 1,
      stdout: command === 'docker' ? 'Docker version test' : '',
    }));

    expect(status.mode).toBe('none');
    expect(status.backends.find((backend) => backend.id === 'docker')?.available).toBe(true);
    expect(formatSandboxStatus(status)).toContain('OS sandboxed execution is not enabled');
    expect(formatSandboxStatus(status)).toContain('Provider credentials are inherited');
  });
});
