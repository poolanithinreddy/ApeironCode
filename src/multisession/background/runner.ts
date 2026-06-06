import {SessionLogStore} from './logStore.js';
import {ProcessManager, type ProcessInfo} from './processManager.js';
import {MultiAgentSessionManager} from '../manager.js';
import type {AgentSessionEventType} from './types.js';

/**
 * Background session runner coordinator.
 *
 * Manages:
 * - Event logging for session lifecycle
 * - Process spawning (local detached child only)
 * - Worker metadata tracking
 * - Graceful stop/cancel behavior
 *
 * Does NOT attempt:
 * - Cloud services
 * - Distributed execution
 * - True process monitoring
 */
export class BackgroundSessionRunner {
  private logStore: SessionLogStore;
  private processManager: ProcessManager;
  private sessionManager: MultiAgentSessionManager;

  constructor(cwd: string) {
    this.logStore = new SessionLogStore(cwd);
    this.processManager = new ProcessManager(cwd);
    this.sessionManager = new MultiAgentSessionManager(cwd);
  }

  async logSessionEvent(
    sessionId: string,
    type: AgentSessionEventType,
    message?: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    await this.logStore.appendEvent(sessionId, type, message, data);
  }

  async getEventLog(sessionId: string) {
    return this.logStore.readEvents(sessionId);
  }

  async getTailEvents(sessionId: string, count: number = 50) {
    return this.logStore.getTailEvents(sessionId, count);
  }

  async getRecentEventsSince(sessionId: string, sinceTimestamp?: string) {
    return this.logStore.getRecentEvents(sessionId, sinceTimestamp);
  }

  streamEvents(sessionId: string, options?: {tail?: number; follow?: boolean; timeout?: number}) {
    return this.logStore.streamEvents(sessionId, options);
  }

  /**
   * Spawn a background worker for a session.
   * Returns worker PID if successful, null otherwise.
   * Parent returns immediately; worker runs independently.
   */
  async spawnWorker(sessionId: string): Promise<ProcessInfo | null> {
    const session = await this.sessionManager.getSession(sessionId);
    if (!session) {
      return null;
    }

    // Log that we're starting a background session
    await this.logSessionEvent(sessionId, 'session_started', 'Background worker spawned');

    const processInfo = this.processManager.spawnWorker(sessionId);
    if (processInfo) {
      // Store worker metadata in session (Phase 7 extension)
      const baseUpdate = {
        summary: `Worker spawned with PID ${processInfo.pid}`,
      };
      await this.sessionManager.updateSession(sessionId, baseUpdate);

      // Note: Worker metadata persistence requires extending AgentSessionRecord
      // in the session store. For now, we log the event and store it there.

      await this.logSessionEvent(sessionId, 'status_changed', `Worker spawned with PID ${processInfo.pid}`, {
        status: 'running',
        workerPid: processInfo.pid,
      });
    }

    return processInfo;
  }

  /**
   * Stop a background session.
   * For running background: signals worker, marks stopped, releases locks.
   * For queued: marks stopped.
   * Always releases file locks to prevent stale locks.
   */
  async stopSession(sessionId: string): Promise<boolean> {
    const session = await this.sessionManager.getSession(sessionId);
    if (!session) {
      return false;
    }

    // Log the stop event
    await this.logSessionEvent(sessionId, 'session_stopped', 'Stop requested by user');

    // If worker is running, try to stop it gracefully
    // Note: workerPid is stored in event log for now, not yet in record
    // This will be available after implementing Phase 7 fully

    // Mark session as stopped
    const stopped = await this.sessionManager.stopSession(sessionId);

    return !!stopped;
  }

  /**
   * Cancel a queued background session.
   * Releases locks and prevents execution.
   */
  async cancelQueuedSession(sessionId: string): Promise<boolean> {
    const session = await this.sessionManager.getSession(sessionId);
    if (!session || session.status !== 'queued') {
      return false;
    }

    await this.logSessionEvent(sessionId, 'session_stopped', 'Queued session cancelled');

    // Stop (which also releases locks)
    return this.stopSession(sessionId);
  }

  /**
   * Check if session has an active worker process.
   */
  hasActiveWorker(sessionId: string, session: {workerPid?: number | undefined} | null): boolean {
    if (!session || session.workerPid === undefined || session.workerPid === null) {
      return false;
    }
    return this.processManager.isProcessRunning(session.workerPid);
  }

  async deleteEventLog(sessionId: string): Promise<void> {
    await this.logStore.deleteEventLog(sessionId);
  }
}
