import {spawn} from 'node:child_process';
import {AppError} from '../utils/errors.js';

export interface ExecutorOptions {
  cwd?: string;
  timeout?: number;
  maxOutputSize?: number;
  env?: Record<string, string>;
}

export interface ExecutorResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export const executeSubprocess = (
  command: string,
  args: string[],
  input: unknown,
  options: ExecutorOptions = {},
): Promise<ExecutorResult> => {
  return new Promise((resolve) => {
    const {cwd = process.cwd(), timeout = 30_000, maxOutputSize = 1_000_000} = options;
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const proc = spawn(command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...options.env,
      },
      timeout,
    });

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
    }, timeout);

    proc.stdin?.write(JSON.stringify(input));
    proc.stdin?.end();

    proc.stdout?.on('data', (data: Buffer) => {
      if (stdout.length < maxOutputSize) {
        stdout += data.toString();
      }
    });

    proc.stderr?.on('data', (data: Buffer) => {
      if (stderr.length < maxOutputSize) {
        stderr += data.toString();
      }
    });

    proc.on('close', (code) => {
      clearTimeout(timeoutHandle);
      resolve({
        ok: !timedOut && code === 0,
        stdout: stdout.slice(0, maxOutputSize),
        stderr: stderr.slice(0, maxOutputSize),
        exitCode: timedOut ? null : code,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutHandle);
      resolve({
        ok: false,
        stdout,
        stderr: `Spawn error: ${String(err)}`,
        exitCode: null,
      });
    });
  });
};

export const executePluginTool = async (
  entrypointPath: string,
  toolName: string,
  input: unknown,
  cwd: string,
): Promise<ExecutorResult> => {
  const inputWithTool = {
    tool: toolName,
    input,
  };

  return executeSubprocess('node', [entrypointPath], inputWithTool, {
    cwd,
    timeout: 30_000,
    maxOutputSize: 1_000_000,
  });
};

export const parsePluginOutput = (result: ExecutorResult): unknown => {
  if (!result.ok) {
    throw new AppError(
      `Plugin execution failed: ${result.stderr || 'unknown error'}`,
      'PLUGIN_EXECUTION_ERROR',
    );
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new AppError(
      `Plugin returned invalid JSON: ${result.stdout.slice(0, 100)}`,
      'PLUGIN_INVALID_OUTPUT',
    );
  }
};
