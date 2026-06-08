import path from 'node:path';

import {ensureDirectory, readJsonFile, writeJsonFile} from '../utils/fs.js';
import {getProjectSessionsDir} from '../utils/paths.js';

export interface FileLock {
  filePath: string;
  sessionId: string;
  goal: string;
  createdAt: string;
  expiresAt?: string;
}

interface LockStore {
  locks: FileLock[];
}

export class FileLockManager {
  constructor(private readonly cwd: string) {}

  private getLocksDir(): string {
    return path.join(getProjectSessionsDir(this.cwd), 'locks');
  }

  private getStorePath(): string {
    return path.join(this.getLocksDir(), 'locks.json');
  }

  private async loadStore(): Promise<LockStore> {
    return readJsonFile<LockStore>(this.getStorePath(), {locks: []});
  }

  private async saveStore(store: LockStore): Promise<void> {
    await ensureDirectory(this.getLocksDir());
    await writeJsonFile(this.getStorePath(), store);
  }

  async acquireLock(filePath: string, sessionId: string, goal: string): Promise<boolean> {
    const store = await this.loadStore();
    const absPath = path.resolve(filePath);

    // Check for existing lock
    const existing = store.locks.find((lock) => lock.filePath === absPath);
    if (existing && existing.sessionId !== sessionId) {
      // Check if lock is expired
      if (existing.expiresAt && new Date(existing.expiresAt) < new Date()) {
        // Lock expired, remove it
        store.locks = store.locks.filter((lock) => lock.filePath !== absPath);
      } else {
        // Lock still active
        return false;
      }
    }

    // Remove old lock for this session on this file (if exists)
    store.locks = store.locks.filter((lock) => !(lock.filePath === absPath && lock.sessionId === sessionId));

    // Add new lock
    store.locks.push({
      createdAt: new Date().toISOString(),
      filePath: absPath,
      goal,
      sessionId,
    });

    await this.saveStore(store);
    return true;
  }

  async releaseLock(filePath: string, sessionId: string): Promise<boolean> {
    const store = await this.loadStore();
    const absPath = path.resolve(filePath);

    const before = store.locks.length;
    store.locks = store.locks.filter((lock) => !(lock.filePath === absPath && lock.sessionId === sessionId));

    if (store.locks.length < before) {
      await this.saveStore(store);
      return true;
    }

    return false;
  }

  async releaseAllForSession(sessionId: string): Promise<number> {
    const store = await this.loadStore();
    const before = store.locks.length;
    store.locks = store.locks.filter((lock) => lock.sessionId !== sessionId);

    if (store.locks.length < before) {
      await this.saveStore(store);
    }

    return before - store.locks.length;
  }

  async isLocked(filePath: string): Promise<FileLock | null> {
    const store = await this.loadStore();
    const absPath = path.resolve(filePath);

    const lock = store.locks.find((lock) => lock.filePath === absPath);
    if (!lock) {
      return null;
    }

    // Check expiry
    if (lock.expiresAt && new Date(lock.expiresAt) < new Date()) {
      // Lock expired
      store.locks = store.locks.filter((l) => l !== lock);
      await this.saveStore(store);
      return null;
    }

    return lock;
  }

  async listLocks(): Promise<FileLock[]> {
    const store = await this.loadStore();
    const now = new Date();

    // Remove expired locks
    store.locks = store.locks.filter((lock) => !lock.expiresAt || new Date(lock.expiresAt) > now);
    await this.saveStore(store);

    return store.locks;
  }

  async checkConflicts(filePath: string, sessionId: string): Promise<FileLock | null> {
    const lock = await this.isLocked(filePath);
    if (lock && lock.sessionId !== sessionId) {
      return lock;
    }

    return null;
  }

  async cleanupStaleLocks(maxAgeMs = 3600000): Promise<number> {
    const store = await this.loadStore();
    const before = store.locks.length;
    const cutoff = new Date(Date.now() - maxAgeMs);

    store.locks = store.locks.filter((lock) => {
      if (lock.expiresAt && new Date(lock.expiresAt) < new Date()) {
        return false; // Remove expired
      }

      if (new Date(lock.createdAt) < cutoff) {
        return false; // Remove stale
      }

      return true;
    });

    if (store.locks.length < before) {
      await this.saveStore(store);
    }

    return before - store.locks.length;
  }

  async clear(): Promise<void> {
    await this.saveStore({locks: []});
  }
}
