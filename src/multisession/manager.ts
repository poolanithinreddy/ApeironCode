import {AgentSessionStore} from './store.js';
import type {AgentSessionRecord, AgentSessionSnapshot, CreateSessionOptions, UpdateSessionOptions} from './types.js';
import {FileLockManager, type FileLock} from './locks.js';

export class MultiAgentSessionManager {
  private store: AgentSessionStore;
  private lockManager: FileLockManager;

  constructor(private readonly cwd: string) {
    this.store = new AgentSessionStore(cwd);
    this.lockManager = new FileLockManager(cwd);
  }

  async createSession(options: CreateSessionOptions): Promise<AgentSessionRecord> {
    return this.store.create({
      commandsRun: [],
      filesChanged: [],
      filesLocked: [],
      goal: options.goal,
      mode: options.mode,
      model: options.model,
      projectRoot: this.cwd,
      provider: options.provider,
      status: 'queued',
      testsRun: [],
    });
  }

  async listSessions(): Promise<AgentSessionRecord[]> {
    return this.store.list();
  }

  async getSession(sessionId: string): Promise<AgentSessionRecord | null> {
    return this.store.load(sessionId);
  }

  async getSnapshot(sessionId: string): Promise<AgentSessionSnapshot | null> {
    const session = await this.store.load(sessionId);
    if (!session) {
      return null;
    }

    const durationMs = session.startedAt
      ? (session.completedAt ? new Date(session.completedAt).getTime() : Date.now()) -
        new Date(session.startedAt).getTime()
      : undefined;

    return {
      commandsRun: session.commandsRun,
      completedAt: session.completedAt,
      filesChanged: session.filesChanged,
      filesLocked: session.filesLocked,
      goal: session.goal,
      id: session.id,
      mode: session.mode,
      startedAt: session.startedAt,
      status: session.status,
      testsRun: session.testsRun,
      durationMs,
    };
  }

  async startSession(sessionId: string): Promise<AgentSessionRecord | null> {
    return this.store.setStatus(sessionId, 'running');
  }

  async pauseSession(sessionId: string): Promise<AgentSessionRecord | null> {
    return this.store.setStatus(sessionId, 'paused');
  }

  async resumeSession(sessionId: string): Promise<AgentSessionRecord | null> {
    return this.store.setStatus(sessionId, 'running');
  }

  async completeSession(sessionId: string, summary?: string): Promise<AgentSessionRecord | null> {
    const updates: Partial<AgentSessionRecord> = {
      status: 'completed' as const,
    };
    if (summary) {
      updates.summary = summary;
    }
    const updated = await this.store.update(sessionId, updates);
    if (updated) {
      await this.lockManager.releaseAllForSession(sessionId);
    }
    return updated;
  }

  async failSession(sessionId: string, error: string): Promise<AgentSessionRecord | null> {
    const updated = await this.store.update(sessionId, {
      error,
      status: 'failed',
    });
    if (updated) {
      await this.lockManager.releaseAllForSession(sessionId);
    }
    return updated;
  }

  async stopSession(sessionId: string): Promise<AgentSessionRecord | null> {
    const updated = await this.store.setStatus(sessionId, 'stopped');
    if (updated) {
      await this.lockManager.releaseAllForSession(sessionId);
    }
    return updated;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    await this.lockManager.releaseAllForSession(sessionId);
    return this.store.delete(sessionId);
  }

  async updateSession(sessionId: string, updates: UpdateSessionOptions): Promise<AgentSessionRecord | null> {
    const session = await this.store.load(sessionId);
    if (!session) {
      return null;
    }

    const merged: Partial<AgentSessionRecord> = {};
    if (updates.filesChanged) {
      merged.filesChanged = Array.from(new Set([...session.filesChanged, ...updates.filesChanged]));
    }
    if (updates.commandsRun) {
      merged.commandsRun = Array.from(new Set([...session.commandsRun, ...updates.commandsRun]));
    }
    if (updates.testsRun) {
      merged.testsRun = Array.from(new Set([...session.testsRun, ...updates.testsRun]));
    }
    if (updates.filesLocked) {
      merged.filesLocked = Array.from(new Set([...session.filesLocked, ...updates.filesLocked]));
    }
    if (updates.summary) {
      merged.summary = updates.summary;
    }

    return this.store.update(sessionId, merged);
  }

  async storeWorkerMetadata(sessionId: string, workerPid: number, workerCommand: string): Promise<AgentSessionRecord | null> {
    return this.store.update(sessionId, {
      workerPid,
      workerCommand,
      workerStartedAt: new Date().toISOString(),
      workerStatus: 'spawned',
    });
  }

  async acquireFileLock(filePath: string, sessionId: string, goal: string): Promise<boolean> {
    return this.lockManager.acquireLock(filePath, sessionId, goal);
  }

  async releaseFileLock(filePath: string, sessionId: string): Promise<boolean> {
    return this.lockManager.releaseLock(filePath, sessionId);
  }

  async checkFileLock(filePath: string): Promise<FileLock | null> {
    return this.lockManager.isLocked(filePath);
  }

  async checkFileConflict(filePath: string, sessionId: string): Promise<FileLock | null> {
    return this.lockManager.checkConflicts(filePath, sessionId);
  }

  async listFileLocks(): Promise<FileLock[]> {
    return this.lockManager.listLocks();
  }

  async releaseSessionLocks(sessionId: string): Promise<number> {
    return this.lockManager.releaseAllForSession(sessionId);
  }

  async cleanupStaleLocks(maxAgeMs?: number): Promise<number> {
    return this.lockManager.cleanupStaleLocks(maxAgeMs);
  }

  async getLatestSession(): Promise<AgentSessionRecord | null> {
    return this.store.getLatest();
  }

  async getActiveSessions(): Promise<AgentSessionRecord[]> {
    const all = await this.store.list();
    return all.filter((session) => session.status === 'running' || session.status === 'paused');
  }
}
