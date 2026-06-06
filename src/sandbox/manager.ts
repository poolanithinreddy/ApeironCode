import {execa} from 'execa';

import type {CommandSemantics} from '../safety/shell/commandSemantics.js';
import type {SandboxBackendId, SandboxExecutionResult, SandboxRunOptions} from './types.js';
import type {SandboxRunner} from './runner.js';
import {DockerSandboxRunner} from './runners/docker.js';
import {PodmanSandboxRunner} from './runners/podman.js';
import {FirejailSandboxRunner} from './runners/firejail.js';
import {trace} from '../utils/trace.js';

type LocalKillSignal = 'SIGTERM' | 'SIGKILL';

export interface SandboxManagerOptions {
  preferredBackend?: SandboxBackendId;
  allowFallbackToLocal?: boolean;
  timeoutMs?: number;
}

export type SandboxFallbackPolicy = 'never' | 'safe-readonly' | 'always';

export interface SandboxFallbackDecision {
  allowed: boolean;
  warning?: string;
}

export const getSandboxFallbackDecision = (
  semantics: CommandSemantics,
  fallbackPolicy: SandboxFallbackPolicy,
): SandboxFallbackDecision => {
  if (fallbackPolicy === 'never') {
    return {
      allowed: false,
      warning: 'Sandbox unavailable and fallback policy is "never"; refusing to execute command without sandbox.',
    };
  }
  if (fallbackPolicy === 'safe-readonly') {
    if (semantics.isReadOnly && !semantics.isNetworkCommand && !semantics.isFilesystemWrite && !semantics.isDestructive) {
      return {
        allowed: true,
        warning: 'Sandbox unavailable; running read-only command locally per "safe-readonly" fallback policy.',
      };
    }
    return {
      allowed: false,
      warning: `Sandbox unavailable and command is not safe-readonly (risk=${semantics.riskLevel}); refusing fallback.`,
    };
  }
  // 'always'
  if (semantics.riskLevel === 'high' || semantics.riskLevel === 'critical' || semantics.isDestructive || semantics.isCredentialRisk) {
    return {
      allowed: true,
      warning: `Sandbox unavailable; "always" fallback policy permitted execution of risky command (risk=${semantics.riskLevel}).`,
    };
  }
  return {
    allowed: true,
    warning: 'Sandbox unavailable; falling back to local execution per "always" policy.',
  };
};

export class SandboxManager {
  private runners: Map<SandboxBackendId, SandboxRunner> = new Map();
  private availableBackend: SandboxBackendId | 'local' | null = null;

  constructor(private options: SandboxManagerOptions = {}) {}

  async getAvailableRunner(): Promise<SandboxRunner | 'local'> {
    // Return cached result if available
    if (this.availableBackend !== null) {
      if (this.availableBackend === 'local') {
        return 'local';
      }
      const cached = this.runners.get(this.availableBackend);
      if (cached) {
        return cached;
      }
    }

    if (process.env['OPENCODE_TEST_OFFLINE'] === '1' && this.options.allowFallbackToLocal !== false) {
      this.availableBackend = 'local';
      return 'local';
    }

    // Try preferred backend first
    if (this.options.preferredBackend) {
      const runner = await this.tryBackend(this.options.preferredBackend);
      if (runner) {
        this.availableBackend = this.options.preferredBackend;
        return runner;
      }
    }

    // Try backends in order of preference
    for (const backend of ['docker', 'podman', 'firejail'] as const) {
      const runner = await this.tryBackend(backend);
      if (runner) {
        this.availableBackend = backend;
        return runner;
      }
    }

    // Fallback to local if allowed
    if (this.options.allowFallbackToLocal !== false) {
      this.availableBackend = 'local';
      return 'local';
    }

    throw new Error('No sandbox backend available and fallback to local execution is disabled');
  }

  private async tryBackend(backendId: SandboxBackendId): Promise<SandboxRunner | null> {
    try {
      const versionResult = await execa(backendId, ['--version'], {
        reject: false,
        timeout: 2000,
      });

      if (versionResult.exitCode !== 0) {
        return null;
      }

      // Try to actually run a simple command to verify backend is working
      const runner = this.createRunner(backendId);
      const testResult = await runner.run('echo test', {cwd: '/tmp', timeout: 3000});

      if (testResult.ok) {
        this.runners.set(backendId, runner);
        return runner;
      }
    } catch {
      // Backend not available or failed
    }

    return null;
  }

  private createRunner(backend: SandboxBackendId): SandboxRunner {
    switch (backend) {
      case 'docker':
        return new DockerSandboxRunner();
      case 'podman':
        return new PodmanSandboxRunner();
      case 'firejail':
        return new FirejailSandboxRunner();
      default: {
        // Exhaustive check: if we reach here, a new backend was added without implementation
        const exhaustive: never = backend;
        return exhaustive;
      }
    }
  }

  async executeCommand(command: string, options: SandboxRunOptions): Promise<SandboxExecutionResult> {
    return trace('sandbox.execute', async () => {
      const runner = await this.getAvailableRunner();

      if (runner === 'local') {
        return this.executeLocal(command, options);
      }

      return runner.run(command, options);
    }, {command, cwd: options.cwd});
  }

  private async executeLocal(
    command: string,
    options: SandboxRunOptions,
  ): Promise<SandboxExecutionResult> {
    const startTime = Date.now();
    const timeoutMs = options.timeout ?? 20000;

    try {
      const subprocess = execa('sh', ['-c', command], {
        detached: process.platform !== 'win32',
        forceKillAfterDelay: 100,
        reject: false,
        signal: options.signal,
        cwd: options.cwd,
        env: {
          ...process.env,
          ...options.env,
        },
      });
      let timedOut = false;
      let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
      const timeoutTimer = setTimeout(() => {
        timedOut = true;
        this.killLocalProcess(subprocess.pid, 'SIGTERM', subprocess.kill.bind(subprocess));
        forceKillTimer = setTimeout(() => {
          this.killLocalProcess(subprocess.pid, 'SIGKILL', subprocess.kill.bind(subprocess));
        }, 100);
      }, timeoutMs);

      const result = await subprocess.finally(() => {
        clearTimeout(timeoutTimer);
        if (forceKillTimer) {
          clearTimeout(forceKillTimer);
        }
      });

      const durationMs = Date.now() - startTime;

      if (timedOut) {
        return {
          ok: false,
          exitCode: 124,
          stdout: this.normalizeOutput(result.stdout ?? ''),
          stderr: `Command timed out after ${timeoutMs}ms`,
          backend: 'local',
          durationMs,
          reason: 'timeout',
        };
      }

      return {
        ok: result.exitCode === 0,
        exitCode: result.exitCode ?? 1,
        stdout: this.normalizeOutput(result.stdout ?? ''),
        stderr: this.normalizeOutput(result.stderr ?? ''),
        backend: 'local',
        durationMs,
        reason: result.exitCode !== 0 ? `Command exited with code ${result.exitCode}` : undefined,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      if (error instanceof Error) {
        if (error.message.includes('SIGTERM') || error.message.includes('SIGKILL')) {
          return {
            ok: false,
            exitCode: 124,
            stdout: '',
            stderr: `Command timed out after ${timeoutMs}ms`,
            backend: 'local',
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
        backend: 'local',
        durationMs,
        reason: 'execution_error',
      };
    }
  }

  private killLocalProcess(
    pid: number | undefined,
    signal: LocalKillSignal,
    killSubprocess: (signal?: LocalKillSignal) => boolean,
  ): void {
    if (pid !== undefined && process.platform !== 'win32') {
      try {
        process.kill(-pid, signal);
        return;
      } catch {
        // The process may have exited between the timeout and signal delivery.
      }
    }

    killSubprocess(signal);
  }

  private normalizeOutput(text: string): string {
    return text.replace(/\r\n/g, '\n').trimEnd();
  }

  async dispose(): Promise<void> {
    for (const runner of this.runners.values()) {
      if (runner.dispose) {
        await runner.dispose().catch(() => undefined);
      }
    }
    this.runners.clear();
  }
}
