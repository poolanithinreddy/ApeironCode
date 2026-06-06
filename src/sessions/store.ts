import fs from 'node:fs/promises';
import path from 'node:path';

import type {ConversationSession} from '../agent/session.js';
import {ensureDirectory, readJsonFile, writeTextFile} from '../utils/fs.js';
import {getSessionsDir} from '../utils/paths.js';
import {serializeSession} from './serializer.js';
import {searchSessions} from './search.js';

export interface SessionSelectionOptions {
  all?: boolean;
  projectPath?: string;
  query?: string;
  sessionId?: string;
}

export class SessionStore {
  async save(session: ConversationSession): Promise<void> {
    const directoryPath = getSessionsDir();
    await ensureDirectory(directoryPath);
    const filePath = path.join(directoryPath, `${session.id}.json`);
    await writeTextFile(filePath, serializeSession(session));
  }

  async load(sessionId: string): Promise<ConversationSession | null> {
    const filePath = path.join(getSessionsDir(), `${sessionId}.json`);
    return readJsonFile<ConversationSession | null>(filePath, null);
  }

  async delete(sessionId: string): Promise<boolean> {
    const filePath = path.join(getSessionsDir(), `${sessionId}.json`);

    try {
      await fs.rm(filePath, {force: true});
      return true;
    } catch {
      return false;
    }
  }

  async list(projectPath?: string): Promise<ConversationSession[]> {
    const directoryPath = getSessionsDir();

    try {
      const entries = await fs.readdir(directoryPath);
      const sessions = await Promise.all(
        entries
          .filter((entry) => entry.endsWith('.json'))
          .map((entry) => readJsonFile<ConversationSession | null>(path.join(directoryPath, entry), null)),
      );

      return sessions
        .filter((session): session is ConversationSession => session !== null)
        .filter((session) => (projectPath ? session.projectPath === projectPath : true))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    } catch {
      return [];
    }
  }

  async search(query: string, projectPath?: string): Promise<ConversationSession[]> {
    const sessions = await this.list(projectPath);
    return searchSessions(sessions, query);
  }

  async select(options: SessionSelectionOptions = {}): Promise<ConversationSession[]> {
    if (options.sessionId) {
      const session = await this.load(options.sessionId);
      return session ? [session] : [];
    }

    if (options.query) {
      return this.search(options.query, options.all ? undefined : options.projectPath);
    }

    return this.list(options.all ? undefined : options.projectPath);
  }
}