import {execa} from 'execa';
import path from 'node:path';

import type {SandboxExecutionResult, SandboxRunOptions} from '../types.js';
import {BaseSandboxRunner} from '../runner.js';

export class FirejailSandboxRunner extends BaseSandboxRunner {
  readonly backend = 'firejail' as const;

  async run(command: string, options: SandboxRunOptions): Promise<SandboxExecutionResult> {
    const startTime = Date.now();
    const timeoutMs = options.timeout ?? 20000;
    const absoluteCwd = path.resolve(options.cwd);

    try {
      const firejailArgs = [
        '--private', // Private /home directory
        '--noprofile', // Don't load default profile
        '--net=none', // Disable network
        '--seccomp', // Enable seccomp filter
        '--caps=none', // Drop all capabilities
        '--rlimit-nofile=100', // Limit file descriptors
        '--rlimit-nproc=50', // Limit processes
        `--whitelist=${absoluteCwd}`, // Allow access to working directory
        '--',
        '/bin/sh',
        '-c',
        command,
      ];

      const result = await execa('firejail', firejailArgs, {
        reject: false,
        timeout: timeoutMs + 5000, // Add buffer
        signal: options.signal,
        cwd: absoluteCwd,
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
        backend: 'firejail',
        durationMs,
        reason: result.exitCode !== 0 ? `Command exited with code ${result.exitCode}` : undefined,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      if (error instanceof Error) {
        if (error.message.includes('SIGTERM') || error.message.includes('SIGKILL')) {
          return {
            ok: false,
            exitCode: 124, // timeout exit code
            stdout: '',
            stderr: `Command timed out after ${timeoutMs}ms`,
            backend: 'firejail',
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
        backend: 'firejail',
        durationMs,
        reason: 'execution_error',
      };
    }
  }

  override async dispose(): Promise<void> {
    // Firejail runner doesn't maintain state
  }
}
