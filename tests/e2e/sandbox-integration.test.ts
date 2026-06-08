import {afterEach, describe, expect, it, vi} from 'vitest';

import {SandboxManager} from '../../src/sandbox/manager.js';
import type {SandboxRunner} from '../../src/sandbox/runner.js';
import type {SandboxExecutionResult, SandboxRunOptions} from '../../src/sandbox/types.js';
import {E2EHarness, toolChunks} from './harness.js';

const result = (backend: SandboxExecutionResult['backend'], output: string, ok = true): SandboxExecutionResult => ({
  backend,
  durationMs: 5,
  exitCode: ok ? 0 : 1,
  ok,
  reason: ok ? undefined : 'execution_error',
  stderr: ok ? '' : output,
  stdout: ok ? output : '',
});

describe('sandbox integration E2E', () => {
  let harness: E2EHarness | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    await harness?.cleanup();
  });

  it('routes runCommand through SandboxManager when a backend is available', async () => {
    const runMock = vi.fn(() => Promise.resolve(result('docker', 'sandboxed')));
    const runner: SandboxRunner = {
      backend: 'docker',
      run: runMock,
    };
    vi.spyOn(SandboxManager.prototype, 'getAvailableRunner').mockResolvedValue(runner);
    harness = await new E2EHarness({
      scripts: [toolChunks('run_command', {command: 'echo sandboxed'}), 'Done.'],
    }).setup();

    const run = await harness.run('Run a sandboxed command', {mode: 'debug'});

    expect(runMock).toHaveBeenCalledWith('echo sandboxed', expect.objectContaining({cwd: harness.workspace}));
    expect(run.toolCalls[0]?.result?.metadata?.backend).toBe('docker');
  });

  it('includes sandbox metadata for local fallback command results', async () => {
    harness = await new E2EHarness({
      scripts: [toolChunks('run_command', {command: 'node -e "console.log(process.cwd())"'}), 'Done.'],
    }).setup();
    const run = await harness.run('Run harmless command', {mode: 'debug'});

    expect(typeof run.toolCalls[0]?.result?.metadata?.backend).toBe('string');
    expect(run.toolCalls[0]?.result?.metadata?.command).toBe('node -e "console.log(process.cwd())"');
    expect(run.toolCalls[0]?.result?.metadata?.cwd).toBe(harness.workspace);
    expect(run.toolCalls[0]?.result?.output).toContain(harness.workspace);
  });

  it('reports unavailable sandbox without enabling local fallback when configured directly', async () => {
    vi.spyOn(SandboxManager.prototype, 'getAvailableRunner').mockRejectedValue(new Error('No sandbox backend available and fallback to local execution is disabled'));
    const manager = new SandboxManager({allowFallbackToLocal: false});

    await expect(manager.executeCommand('echo no', {cwd: '/tmp'})).rejects.toThrow('No sandbox backend available');
  });

  it('constructs command execution without network by default', async () => {
    const runMock = vi.fn((_command: string, options: SandboxRunOptions) =>
      Promise.resolve(result('firejail', JSON.stringify({envKeys: Object.keys(options.env ?? {})}))));
    const runner: SandboxRunner = {
      backend: 'firejail',
      run: runMock,
    };
    vi.spyOn(SandboxManager.prototype, 'getAvailableRunner').mockResolvedValue(runner);
    harness = await new E2EHarness({
      scripts: [toolChunks('run_command', {command: 'echo offline'}), 'Done.'],
    }).setup();

    await harness.run('Run offline-safe command', {mode: 'debug'});
    expect(runMock).toHaveBeenCalledWith('echo offline', expect.objectContaining({signal: undefined, timeout: 20000}));
  });

  it('repeated sandbox failures terminate normally instead of creating infinite progress', async () => {
    const runMock = vi.fn(() => Promise.resolve(result('podman', 'sandbox failed', false)));
    vi.spyOn(SandboxManager.prototype, 'getAvailableRunner').mockResolvedValue({
      backend: 'podman',
      run: runMock,
    });
    harness = await new E2EHarness({
      scripts: [
        toolChunks('run_command', {command: 'node -e "process.exit(1)"'}),
        toolChunks('run_command', {command: 'node -e "process.exit(1)"'}),
        'Stopping after sandbox failures.',
      ],
    }).setup();

    const run = await harness.run('Try command but do not loop forever', {mode: 'debug'});
    expect(run.toolCalls.filter((toolCall) => toolCall.toolName === 'run_command')).toHaveLength(2);
    expect(run.result.finalMessage.content).toContain('Stopping');
  });
});
