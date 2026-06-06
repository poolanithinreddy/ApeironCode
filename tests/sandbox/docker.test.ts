import {execa} from 'execa';
import {describe, expect, it} from 'vitest';

import {DockerSandboxRunner} from '../../src/sandbox/runners/docker.js';

const isDockerAvailable = async (): Promise<boolean> => {
  try {
    // Check if docker command exists
    const versionResult = await execa('docker', ['--version'], {reject: false, timeout: 2000});
    if (versionResult.exitCode !== 0) {
      return false;
    }
    // Check if docker daemon is running by trying to list containers
    const daemonResult = await execa('docker', ['ps'], {reject: false, timeout: 2000});
    return daemonResult.exitCode === 0;
  } catch {
    return false;
  }
};

describe('DockerSandboxRunner', {skip: !(await isDockerAvailable())}, () => {
  it('executes simple command in container', async () => {
    const runner = new DockerSandboxRunner();
    const result = await runner.run('echo "hello world"', {
      cwd: '/tmp',
      timeout: 10000,
    });

    expect(result.ok).toBe(true);
    expect(result.backend).toBe('docker');
    expect(result.stdout).toContain('hello world');
  });

  it('isolates from host network', async () => {
    const runner = new DockerSandboxRunner();
    const result = await runner.run('ping -c 1 1.1.1.1', {
      cwd: '/tmp',
      timeout: 5000,
    });

    // Should fail because network is disabled
    expect(result.ok).toBe(false);
  });

  it('mounts working directory read-write', async () => {
    const runner = new DockerSandboxRunner();
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
    const runner = new DockerSandboxRunner();
    const result = await runner.run('sleep 30', {
      cwd: '/tmp',
      timeout: 500,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('timeout');
  });

  it('captures exit codes correctly', async () => {
    const runner = new DockerSandboxRunner();
    const result = await runner.run('false', {
      cwd: '/tmp',
      timeout: 5000,
    });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBeGreaterThan(0);
  });

  it('has containerId in result', async () => {
    const runner = new DockerSandboxRunner();
    const result = await runner.run('echo "test"', {
      cwd: '/tmp',
      timeout: 5000,
    });

    expect(result.containerId).toBeDefined();
    expect(result.containerId).toMatch(/^opencode-/);
  });

  it('cleans up container on success', async () => {
    const runner = new DockerSandboxRunner();
    const result = await runner.run('echo "test"', {
      cwd: '/tmp',
      timeout: 5000,
    });

    expect(result.ok).toBe(true);

    // Try to inspect container - should fail if cleaned up
    const containerCheck = await execa('docker', ['inspect', result.containerId!], {
      reject: false,
    });

    expect(containerCheck.exitCode).not.toBe(0);
  });
});
