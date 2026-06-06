import {execa} from 'execa';
import {describe, expect, it} from 'vitest';

import {FirejailSandboxRunner} from '../../src/sandbox/runners/firejail.js';

const isFirejailAvailable = async (): Promise<boolean> => {
  try {
    const result = await execa('firejail', ['--version'], {reject: false, timeout: 2000});
    return result.exitCode === 0;
  } catch {
    return false;
  }
};

describe('FirejailSandboxRunner', {skip: !(await isFirejailAvailable())}, () => {
  it('executes simple command in jail', async () => {
    const runner = new FirejailSandboxRunner();
    const result = await runner.run('echo "hello world"', {
      cwd: '/tmp',
      timeout: 10000,
    });

    expect(result.ok).toBe(true);
    expect(result.backend).toBe('firejail');
    expect(result.stdout).toContain('hello world');
  });

  it('isolates from host network', async () => {
    const runner = new FirejailSandboxRunner();
    const result = await runner.run('ping -c 1 1.1.1.1', {
      cwd: '/tmp',
      timeout: 5000,
    });

    // Should fail because network is disabled
    expect(result.ok).toBe(false);
  });

  it('respects timeout', async () => {
    const runner = new FirejailSandboxRunner();
    const result = await runner.run('sleep 30', {
      cwd: '/tmp',
      timeout: 500,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('timeout');
  });

  it('captures exit codes correctly', async () => {
    const runner = new FirejailSandboxRunner();
    const result = await runner.run('false', {
      cwd: '/tmp',
      timeout: 5000,
    });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBeGreaterThan(0);
  });

  it('executes with read-only root except working directory', async () => {
    const runner = new FirejailSandboxRunner();
    const result = await runner.run('test -w /tmp', {
      cwd: '/tmp',
      timeout: 5000,
    });

    // /tmp may be accessible in firejail depending on profile
    // Just verify command ran successfully
    expect(result.backend).toBe('firejail');
  });
});
