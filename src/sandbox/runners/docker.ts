import {execa} from 'execa';
import path from 'node:path';

import type {SandboxExecutionResult, SandboxRunOptions} from '../types.js';
import {BaseSandboxRunner} from '../runner.js';

export class DockerSandboxRunner extends BaseSandboxRunner {
  readonly backend = 'docker' as const;

  async run(command: string, options: SandboxRunOptions): Promise<SandboxExecutionResult> {
    const startTime = Date.now();
    const containerName = `apeironcode-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const timeoutMs = options.timeout ?? 20000;
    const absoluteCwd = path.resolve(options.cwd);

    try {
      const dockerArgs = [
        'run',
        '--rm',
        `--name=${containerName}`,
        '--net=none', // Disable network
        '--cap-drop=ALL', // Drop all capabilities
        `--memory=512m`, // Memory limit
        `--cpus=1`, // CPU limit
        '--pids-limit=100', // Process limit
        '--read-only', // Read-only root
        `--workdir=/workspace`,
        `-v=${absoluteCwd}:/workspace:rw`, // Mount cwd read-write
        '--timeout', `${Math.ceil(timeoutMs / 1000)}`, // Container timeout
        'alpine:latest',
        '/bin/sh',
        '-c',
        command,
      ];

      const result = await execa('docker', dockerArgs, {
        reject: false,
        timeout: timeoutMs + 5000, // Add buffer for cleanup
        signal: options.signal,
        env: {
          ...process.env,
          ...options.env,
        },
      });

      const durationMs = Date.now() - startTime;

      return {
        ok: result.exitCode === 0,
        exitCode: result.exitCode ?? 1,
        stdout: this.normalizeOutput(result.stdout ?? ''),
        stderr: this.normalizeOutput(result.stderr ?? ''),
        backend: 'docker',
        containerId: containerName,
        durationMs,
        reason: result.exitCode !== 0 ? `Command exited with code ${result.exitCode}` : undefined,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // Clean up container on error
      await execa('docker', ['rm', '-f', containerName], {reject: false}).catch(() => undefined);

      if (error instanceof Error) {
        if (error.message.includes('SIGTERM') || error.message.includes('SIGKILL')) {
          return {
            ok: false,
            exitCode: 124, // timeout exit code
            stdout: '',
            stderr: `Command timed out after ${timeoutMs}ms`,
            backend: 'docker',
            containerId: containerName,
            durationMs,
            reason: 'timeout',
          };
        }
      }

      return {
        ok: false,
        exitCode: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        backend: 'docker',
        containerId: containerName,
        durationMs,
        reason: 'execution_error',
      };
    }
  }

  override async dispose(): Promise<void> {
    // Docker runner doesn't maintain state
  }
}
