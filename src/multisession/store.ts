import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {ensureDirectory, readJsonFile, writeJsonFile} from '../utils/fs.js';
import {getProjectSessionsDir} from '../utils/paths.js';
import type {AgentSessionRecord, AgentSessionStatus} from './types.js';

export class AgentSessionStore {
  constructor(private readonly cwd: string) {}

  private getSessionPath(sessionId: string): string {
    return path.join(getProjectSessionsDir(this.cwd), 'agents', `${sessionId}.json`);
  }

  private getAgentsDir(): string {
    return path.join(getProjectSessionsDir(this.cwd), 'agents');
  }

  createId(): string {
    return crypto.randomUUID();
  }

  async create(record: Omit<AgentSessionRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<AgentSessionRecord> {
    const now = new Date().toISOString();
    const session: AgentSessionRecord = {
      ...record,
      createdAt: now,
      id: this.createId(),
      updatedAt: now,
    };

    await this.save(session);
    return session;
  }

  async save(session: AgentSessionRecord): Promise<void> {
    await ensureDirectory(this.getAgentsDir());
    session.updatedAt = new Date().toISOString();
    await writeJsonFile(this.getSessionPath(session.id), session);
  }

  async load(sessionId: string): Promise<AgentSessionRecord | null> {
    return readJsonFile<AgentSessionRecord | null>(this.getSessionPath(sessionId), null);
  }

  async list(): Promise<AgentSessionRecord[]> {
    const dir = this.getAgentsDir();
    try {
      const entries = await fs.readdir(dir);
      const sessions = await Promise.all(
        entries
          .filter((entry) => entry.endsWith('.json'))
          .map((entry) => readJsonFile<AgentSessionRecord | null>(path.join(dir, entry), null)),
      );

      return sessions
        .filter((session): session is AgentSessionRecord => session !== null)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    } catch {
      return [];
    }
  }

  async delete(sessionId: string): Promise<boolean> {
    try {
      await fs.rm(this.getSessionPath(sessionId), {force: true});
      return true;
    } catch {
      return false;
    }
  }

  async setStatus(sessionId: string, status: AgentSessionStatus): Promise<AgentSessionRecord | null> {
    const session = await this.load(sessionId);
    if (!session) {
      return null;
    }

    session.status = status;
    if (status === 'running' && !session.startedAt) {
      session.startedAt = new Date().toISOString();
    }
    if ((status === 'completed' || status === 'failed' || status === 'stopped') && !session.completedAt) {
      session.completedAt = new Date().toISOString();
      if (status === 'stopped' && !session.stoppedAt) {
        session.stoppedAt = new Date().toISOString();
      }
    }

    await this.save(session);
    return session;
  }

  async update(sessionId: string, updates: Partial<AgentSessionRecord>): Promise<AgentSessionRecord | null> {
    const session = await this.load(sessionId);
    if (!session) {
      return null;
    }

    const updated = {...session, ...updates};
    await this.save(updated);
    return updated;
  }

  async getLatest(): Promise<AgentSessionRecord | null> {
    return (await this.list())[0] ?? null;
  }

  async getLatestByStatus(status: AgentSessionStatus): Promise<AgentSessionRecord | null> {
    return (await this.list()).find((session) => session.status === status) ?? null;
  }
}
