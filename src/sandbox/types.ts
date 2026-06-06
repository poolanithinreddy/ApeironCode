export type SandboxBackendId = 'docker' | 'firejail' | 'podman';

export type SandboxMode = 'advisory' | 'none';

export interface SandboxBackendStatus {
  available: boolean;
  command: string;
  detail: string;
  id: SandboxBackendId;
}

export interface SandboxStatus {
  backends: SandboxBackendStatus[];
  limitations: string[];
  mode: SandboxMode;
}

export interface SandboxRunOptions {
  cwd: string;
  timeout?: number; // milliseconds, default 20000
  env?: Record<string, string>;
  signal?: AbortSignal;
}

export interface SandboxExecutionResult {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  backend: SandboxBackendId | 'local';
  containerId?: string; // Container/process ID if applicable
  reason?: string; // Error reason if not ok
}

export class SandboxExecutionError extends Error {
  constructor(
    public readonly exitCode: number,
    public readonly stdout: string,
    public readonly stderr: string,
    public readonly backend: SandboxBackendId | 'local',
  ) {
    super(`Sandbox execution failed with exit code ${exitCode}`);
    this.name = 'SandboxExecutionError';
  }
}

