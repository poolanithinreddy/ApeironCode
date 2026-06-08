import {execa} from 'execa';
import {describe, expect, it} from 'vitest';

import {PodmanSandboxRunner} from '../../src/sandbox/runners/podman.js';

const isPodmanAvailable = async (): Promise<boolean> => {
  try {
    const versionResult = await execa('podman', ['--version'], {reject: false, timeout: 2000});
    if (versionResult.exitCode !== 0) {
      return false;
    }
    const serviceResult = await execa('podman', ['info'], {reject: false, timeout: 2000});
    return serviceResult.exitCode === 0;
  } catch {
    return false;
  }
};

describe('PodmanSandboxRunner', {
  skip:
    process.env['APEIRONCODE_TEST_OFFLINE'] === '1' ||
    process.env['OPENCODE_TEST_OFFLINE'] === '1' ||
    !(await isPodmanAvailable()),
}, () => {
  it('executes simple command in container', async () => {
    const runner = new PodmanSandboxRunner();
    const result = await runner.run('echo "hello world"', {
      cwd: '/tmp',
      timeout: 10000,
    });

    expect(result.ok).toBe(true);
    expect(result.backend).toBe('podman');
    expect(result.stdout).toContain('hello world');
  });

  it('isolates from host network', async () => {
    const runner = new PodmanSandboxRunner();
    const result = await runner.run('ping -c 1 1.1.1.1', {
      cwd: '/tmp',
      timeout: 5000,
    });

    // Should fail because network is disabled
    expect(result.ok).toBe(false);
  });

  it('mounts working directory read-write', async () => {
    const runner = new PodmanSandboxRunner();
    const result = await runner.run(
      'cd /workspace && echo "test" > test.txt && cat test.txt',
      {
        cwd: '/tmp',
        timeout: 10000,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.stdout).toContain('test');
  });

  it('respects timeout', async () => {
    const runner = new PodmanSandboxRunner();
    const result = await runner.run('sleep 30', {
      cwd: '/tmp',
      timeout: 500,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('timeout');
  });

  it('captures exit codes correctly', async () => {
    const runner = new PodmanSandboxRunner();
    const result = await runner.run('false', {
      cwd: '/tmp',
      timeout: 5000,
    });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBeGreaterThan(0);
  });

  it('has containerId in result', async () => {
    const runner = new PodmanSandboxRunner();
    const result = await runner.run('echo "test"', {
      cwd: '/tmp',
      timeout: 5000,
    });

    expect(result.containerId).toBeDefined();
    expect(result.containerId).toMatch(/^apeironcode-/);
  });
});
