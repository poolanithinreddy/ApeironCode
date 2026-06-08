import type {SandboxBackendId, SandboxExecutionResult, SandboxRunOptions} from './types.js';

export interface SandboxRunner {
  readonly backend: SandboxBackendId;
  run(command: string, options: SandboxRunOptions): Promise<SandboxExecutionResult>;
  dispose?(): Promise<void>;
}

export abstract class BaseSandboxRunner implements SandboxRunner {
  abstract readonly backend: SandboxBackendId;

  abstract run(command: string, options: SandboxRunOptions): Promise<SandboxExecutionResult>;

  protected normalizeOutput(text: string): string {
    return text.replace(/\r\n/g, '\n').trimEnd();
  }

  dispose?(): Promise<void>;
}
