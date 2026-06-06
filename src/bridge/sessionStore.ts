/**
 * ApeironCode Bridge Session Store.
 * Tracks bridge session state in local JSON storage.
 * No raw tool outputs, no secrets.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {getProjectConfigDir} from '../utils/paths.js';
import {redactBridgePayload} from './redaction.js';
import type {BridgeMessage} from './types.js';

const SESSION_DIR_NAME = 'bridge-sessions';
const MAX_MESSAGES_PER_SESSION = 100;

export type BridgeSessionStatus = 'active' | 'idle' | 'completed' | 'error';

export interface BridgeSessionCounters {
  messages: number;
  toolCalls: number;
  errors: number;
  permissions: number;
}

export interface BridgeSession {
  id: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  status: BridgeSessionStatus;
  activeTaskId?: string;
  activeAgentRunId?: string;
  lastMessage?: string;
  counters: BridgeSessionCounters;
  metadata: Record<string, unknown>;
}

export interface CreateBridgeSessionInput {
  cwd: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateBridgeSessionPatch {
  status?: BridgeSessionStatus;
  activeTaskId?: string;
  activeAgentRunId?: string;
  lastMessage?: string;
  counters?: BridgeSessionCounters;
  metadata?: Record<string, unknown>;
}

export interface BridgeSessionFilter {
  status?: BridgeSessionStatus;
}

const makeCounter = (): BridgeSessionCounters => ({
  messages: 0, toolCalls: 0, errors: 0, permissions: 0,
});

export class BridgeSessionStore {
  private readonly sessionsDir: string;

  constructor(cwd: string) {
    this.sessionsDir = path.join(getProjectConfigDir(cwd), SESSION_DIR_NAME);
  }

  private sessionPath(id: string): string {
    return path.join(this.sessionsDir, `${id}.json`);
  }

  async createSession(input: CreateBridgeSessionInput): Promise<BridgeSession> {
    await fs.mkdir(this.sessionsDir, {recursive: true});
    const now = new Date().toISOString();
    const session: BridgeSession = {
      id: randomUUID(),
      cwd: input.cwd,
      createdAt: now,
      updatedAt: now,
      status: 'active',
      counters: makeCounter(),
      metadata: redactBridgePayload(input.metadata ?? {}) as Record<string, unknown>,
    };
    await fs.writeFile(this.sessionPath(session.id), JSON.stringify(session, null, 2));
    return session;
  }

  async getSession(sessionId: string): Promise<BridgeSession | null> {
    try {
      const raw = await fs.readFile(this.sessionPath(sessionId), 'utf8');
      return JSON.parse(raw) as BridgeSession;
    } catch {
      return null;
    }
  }

  async updateSession(sessionId: string, patch: UpdateBridgeSessionPatch): Promise<BridgeSession | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;
    const updated: BridgeSession = {
      ...session,
      ...patch,
      counters: patch.counters ?? session.counters,
      updatedAt: new Date().toISOString(),
      metadata: patch.metadata
        ? redactBridgePayload({...session.metadata, ...patch.metadata}) as Record<string, unknown>
        : session.metadata,
    };
    await fs.writeFile(this.sessionPath(sessionId), JSON.stringify(updated, null, 2));
    return updated;
  }

  async listSessions(filter?: BridgeSessionFilter): Promise<BridgeSession[]> {
    try {
      const files = await fs.readdir(this.sessionsDir);
      const sessions: BridgeSession[] = [];
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = await fs.readFile(path.join(this.sessionsDir, file), 'utf8');
          const session = JSON.parse(raw) as BridgeSession;
          if (!filter || !filter.status || session.status === filter.status) {
            sessions.push(session);
          }
        } catch { /* skip malformed */ }
      }
      return sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      return [];
    }
  }

  async appendMessage(sessionId: string, message: BridgeMessage): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) return;

    const counters = {...session.counters};
    counters.messages++;
    if (message.type === 'tool.completed' || message.type === 'tool.failed') counters.toolCalls++;
    if (message.type === 'bridge.error') counters.errors++;
    if (message.type === 'permission.requested') counters.permissions++;

    // Enforce message limit — only store summary
    const msgList: string[] = [];
    const messagesPath = path.join(this.sessionsDir, `${sessionId}-messages.json`);
    try {
      const raw = await fs.readFile(messagesPath, 'utf8');
      const parsed = JSON.parse(raw) as string[];
      msgList.push(...parsed);
    } catch { /* no messages yet */ }

    if (msgList.length < MAX_MESSAGES_PER_SESSION) {
      const safe = redactBridgePayload(message.payload) as Record<string, unknown>;
      msgList.push(`${message.timestamp}|${message.type}|${JSON.stringify(safe).slice(0, 200)}`);
      await fs.writeFile(messagesPath, JSON.stringify(msgList, null, 2));
    }

    await this.updateSession(sessionId, {counters, lastMessage: message.type});
  }
}
