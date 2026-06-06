import {spawn} from 'node:child_process';
import {join} from 'node:path';

export interface ProcessInfo {
  pid: number;
  command: string;
}

/**
 * Local-only process manager for spawning background agent workers.
 *
 * Uses detached child processes running the same CLI binary:
 * `apeironcode session run-worker <sessionId>`
 *
 * Process is completely independent—parent returns immediately.
 * Worker process manages its own logging and session state.
 *
 * Limitations:
 * - No distributed process management
 * - No cloud service
 * - Worker crashes are not automatically restarted
 * - Process info is metadata only; true process monitoring requires OS tools
 */
export class ProcessManager {
  constructor(private readonly cwd: string) {}

  /**
   * Spawn a detached background worker process.
   * Returns immediately with process info.
   * Worker runs independently.
   */
  spawnWorker(sessionId: string): ProcessInfo | null {
    try {
      // Spawn the worker as a completely detached process
      // The parent exits; the child continues independently
      const child = spawn(process.execPath, [join(__dirname, '../../../cli/index.js'), 'session', 'run-worker', sessionId], {
        detached: true,
        stdio: 'ignore',
        cwd: this.cwd,
      });

      const pid = child.pid;
      if (!pid) {
        return null;
      }

      // Unref so parent doesn't wait for child
      child.unref();

      return {
        pid,
        command: `apeironcode session run-worker ${sessionId}`,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if a process is still running (Unix only, platform-dependent).
   * Returns false if not running or if check fails.
   * This is metadata only—true process monitoring requires OS tools.
   */
  isProcessRunning(pid: number): boolean {
    try {
      // Unix: signal 0 checks if process exists without sending a signal
      // Will fail if process doesn't exist or on Windows
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Attempt to stop a process.
   * Sends SIGTERM (graceful shutdown request).
   * May fail if process doesn't exist or platform doesn't support it.
   * Caller should verify with isProcessRunning if needed.
   */
  stopProcess(pid: number): boolean {
    try {
      process.kill(pid, 'SIGTERM');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Force kill a process.
   * Sends SIGKILL (immediate termination).
   * May fail on Windows or if process doesn't exist.
   */
  killProcess(pid: number): boolean {
    try {
      process.kill(pid, 'SIGKILL');
      return true;
    } catch {
      return false;
    }
  }
}
