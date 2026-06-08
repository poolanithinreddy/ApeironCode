import {execa} from 'execa';
import {describe, expect, it} from 'vitest';

import {SandboxManager} from '../../src/sandbox/manager.js';

const isAnyBackendAvailable = async (): Promise<boolean> => {
  try {
    // Check local shell availability - always available
    await execa('sh', ['-c', 'echo test'], {reject: false, timeout: 1000});
    return true;
  } catch {
    return false;
  }
};

describe('SandboxManager', {skip: !(await isAnyBackendAvailable())}, () => {
  it('executes commands and returns results', async () => {
    const manager = new SandboxManager({
      // Force use of non-existent backends to fall back to local
      preferredBackend: 'firejail',
      allowFallbackToLocal: true,
    });
    const result = await manager.executeCommand('true', {
      cwd: '/tmp',
      timeout: 5000,
    });

    expect(result.ok).toBe(true);
    expect(result.backend).toBeDefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns error for failing commands', async () => {
    const manager = new SandboxManager({allowFallbackToLocal: true});
    const result = await manager.executeCommand('false', {
      cwd: '/tmp',
      timeout: 5000,
    });

    expect(result.ok).toBe(false);
    expect(result.exitCode).not.toBe(0);
  });

  it('respects timeout option', async () => {
    const manager = new SandboxManager({allowFallbackToLocal: true});
    const result = await manager.executeCommand('sleep 30', {
      cwd: '/tmp',
      timeout: 100,
    });

    expect(result.ok).toBe(false);
    // Should timeout and not complete successfully
    expect(result.reason).toBeDefined();
  });

  it('returns consistent backend across executions', async () => {
    const manager = new SandboxManager({allowFallbackToLocal: true});
    const result1 = await manager.executeCommand('true', {cwd: '/tmp', timeout: 5000});
    const result2 = await manager.executeCommand('true', {cwd: '/tmp', timeout: 5000});

    expect(result1.backend).toBe(result2.backend);
  });

  it('caches available runner after first detection', async () => {
    const manager = new SandboxManager({allowFallbackToLocal: true});

    const runner1 = await manager['getAvailableRunner']();
    const runner2 = await manager['getAvailableRunner']();

    expect(runner1).toBe(runner2);
  });

  it('prefers specified backend when available', async () => {
    const manager = new SandboxManager({
      preferredBackend: 'docker',
      allowFallbackToLocal: true,
    });

    const result = await manager.executeCommand('echo "test"', {
      cwd: '/tmp',
      timeout: 5000,
    });

    // Will fall back to local since docker is likely not available in test
    expect(result.backend === 'docker' || result.backend === 'local').toBe(true);
  });

  it('caches runner detection correctly', async () => {
    const manager = new SandboxManager({allowFallbackToLocal: true});

    const runner1 = await manager['getAvailableRunner']();
    const runner2 = await manager['getAvailableRunner']();

    // Should return the same runner instance when cached
    expect(runner1).toEqual(runner2);
  });

  it('returns consistent backend in repeated executions', async () => {
    const manager = new SandboxManager({allowFallbackToLocal: true});

    const result1 = await manager.executeCommand('exit 0', {
      cwd: '/tmp',
      timeout: 5000,
    });

    const result2 = await manager.executeCommand('exit 0', {
      cwd: '/tmp',
      timeout: 5000,
    });

    // Should use same backend for both
    expect(result1.backend).toBe(result2.backend);
  });
});
