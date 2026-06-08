import {LspSession} from './session.js';
import type {LspDetectionResult, LspManagerOptions} from './types.js';

const toSessionKey = (workspaceRoot: string, status: LspDetectionResult): string => {
  return `${workspaceRoot}::${status.language}::${status.serverCommand ?? 'unknown'}`;
};

type ManagedOptions = Required<Pick<LspManagerOptions, 'fallbackOnFailure' | 'idleTimeoutMs' | 'longLivedSessions' | 'maxSessions' | 'requestTimeoutMs' | 'startupTimeoutMs'>>;

export class LspSessionManager {
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private readonly sessions = new Map<string, LspSession>();

  constructor(private options: ManagedOptions) {}

  updateOptions(options: Partial<ManagedOptions>): void {
    this.options = {
      ...this.options,
      ...options,
    };
  }

  async getOrCreateSession(workspaceRoot: string, status: LspDetectionResult): Promise<LspSession | null> {
    if (!this.options.longLivedSessions) {
      return null;
    }

    if (status.status !== 'available' || !status.serverCommand) {
      return null;
    }

    const key = toSessionKey(workspaceRoot, status);
    const existing = this.sessions.get(key);
    if (existing) {
      return existing;
    }

    await this.evictIfNeeded();
    this.ensureCleanupLoop();

    const session = new LspSession({
      language: status.language,
      requestTimeoutMs: this.options.requestTimeoutMs,
      serverArgs: status.serverArgs,
      serverCommand: status.serverCommand,
      startupTimeoutMs: this.options.startupTimeoutMs,
      workspaceRoot,
    });
    this.sessions.set(key, session);
    return session;
  }

  listSessions(language?: string) {
    return Array.from(this.sessions.values())
      .filter((session) => session.hasLanguage(language))
      .map((session) => session.getSnapshot())
      .sort((left, right) => (right.lastUsedAt ?? '').localeCompare(left.lastUsedAt ?? ''));
  }

  async stopSessions(language?: string): Promise<number> {
    const targets = Array.from(this.sessions.entries()).filter(([, session]) => session.hasLanguage(language));
    await Promise.all(targets.map(async ([key, session]) => {
      await session.shutdown();
      this.sessions.delete(key);
    }));

    if (this.sessions.size === 0) {
      this.stopCleanupLoop();
    }

    return targets.length;
  }

  async restartSessions(language?: string): Promise<number> {
    const targets = Array.from(this.sessions.values()).filter((session) => session.hasLanguage(language));
    await Promise.all(targets.map(async (session) => {
      await session.restart();
    }));
    return targets.length;
  }

  getCacheSnapshot() {
    const aggregate = {
      byMethod: {},
      entries: 0,
      hits: 0,
      invalidations: 0,
      misses: 0,
      writes: 0,
    } as ReturnType<LspSession['getCacheSnapshot']>;

    for (const session of this.sessions.values()) {
      const snapshot = session.getCacheSnapshot();
      aggregate.entries += snapshot.entries;
      aggregate.hits += snapshot.hits;
      aggregate.invalidations += snapshot.invalidations;
      aggregate.misses += snapshot.misses;
      aggregate.writes += snapshot.writes;
      for (const [method, count] of Object.entries(snapshot.byMethod)) {
        const typedMethod = method as keyof typeof snapshot.byMethod;
        aggregate.byMethod[typedMethod] = (aggregate.byMethod[typedMethod] ?? 0) + (count ?? 0);
      }
    }

    return aggregate;
  }

  clearCache(): void {
    for (const session of this.sessions.values()) {
      session.clearCache();
    }
  }

  invalidateFile(filePath: string): void {
    for (const session of this.sessions.values()) {
      session.invalidateFile(filePath);
    }
  }

  async dispose(): Promise<void> {
    this.stopCleanupLoop();
    await this.stopSessions();
  }

  private ensureCleanupLoop(): void {
    if (this.cleanupTimer) {
      return;
    }

    const cleanupIntervalMs = Math.max(1_000, Math.min(this.options.idleTimeoutMs, 30_000));
    this.cleanupTimer = setInterval(() => {
      void this.runIdleCleanup();
    }, cleanupIntervalMs);
    this.cleanupTimer.unref?.();
  }

  private stopCleanupLoop(): void {
    if (!this.cleanupTimer) {
      return;
    }

    clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  private async runIdleCleanup(): Promise<void> {
    const now = Date.now();
    const expired = Array.from(this.sessions.entries()).filter(([, session]) => session.isIdle(now, this.options.idleTimeoutMs));
    await Promise.all(expired.map(async ([key, session]) => {
      await session.shutdown();
      this.sessions.delete(key);
    }));

    if (this.sessions.size === 0) {
      this.stopCleanupLoop();
    }
  }

  private async evictIfNeeded(): Promise<void> {
    if (this.sessions.size < this.options.maxSessions) {
      return;
    }

    const oldest = Array.from(this.sessions.entries())
      .map(([key, session]) => ({key, session, snapshot: session.getSnapshot()}))
      .sort((left, right) => (left.snapshot.lastUsedAt ?? left.snapshot.startedAt ?? '').localeCompare(right.snapshot.lastUsedAt ?? right.snapshot.startedAt ?? ''))[0];

    if (!oldest) {
      return;
    }

    await oldest.session.shutdown();
    this.sessions.delete(oldest.key);
  }
}

let sharedSessionManager: LspSessionManager | null = null;
let cleanupRegistered = false;

export const getSharedLspSessionManager = (options: Partial<ManagedOptions> = {}): LspSessionManager => {
  if (!sharedSessionManager) {
    sharedSessionManager = new LspSessionManager({
      fallbackOnFailure: options.fallbackOnFailure ?? true,
      idleTimeoutMs: options.idleTimeoutMs ?? 300_000,
      longLivedSessions: options.longLivedSessions ?? true,
      maxSessions: options.maxSessions ?? 5,
      requestTimeoutMs: options.requestTimeoutMs ?? 3_000,
      startupTimeoutMs: options.startupTimeoutMs ?? options.requestTimeoutMs ?? 3_000,
    });
  } else {
    sharedSessionManager.updateOptions(options);
  }

  if (!cleanupRegistered) {
    cleanupRegistered = true;
    process.once('beforeExit', () => {
      void sharedSessionManager?.dispose();
    });
  }

  return sharedSessionManager;
};