import crypto from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

import {readTextFile} from '../utils/fs.js';

export interface LspDocumentRecord {
  filePath: string;
  uri: string;
  languageId: string;
  version: number;
  contentHash: string;
  lastOpenedAt: string;
  lastChangedAt: string;
}

export interface LspDocumentSyncPlan {
  state: 'opened' | 'changed' | 'unchanged';
  record: LspDocumentRecord;
  text: string;
}

const hashContent = (content: string): string => {
  return crypto.createHash('sha1').update(content).digest('hex');
};

export class LspDocumentStore {
  private readonly records = new Map<string, LspDocumentRecord>();
  private readonly pathByUri = new Map<string, string>();

  async planSync(
    filePath: string,
    languageId: string,
    options?: {forceSync?: boolean; text?: string},
  ): Promise<LspDocumentSyncPlan> {
    const resolvedPath = path.resolve(filePath);
    const text = options?.text ?? await readTextFile(resolvedPath);
    const contentHash = hashContent(text);
    const now = new Date().toISOString();
    const uri = pathToFileURL(resolvedPath).href;
    const existing = this.records.get(resolvedPath);

    if (!existing) {
      return {
        record: {
          contentHash,
          filePath: resolvedPath,
          languageId,
          lastChangedAt: now,
          lastOpenedAt: now,
          uri,
          version: 1,
        },
        state: 'opened',
        text,
      };
    }

    if (options?.forceSync || existing.contentHash !== contentHash) {
      return {
        record: {
          ...existing,
          contentHash,
          lastChangedAt: existing.contentHash !== contentHash ? now : existing.lastChangedAt,
          version: existing.version + 1,
        },
        state: 'changed',
        text,
      };
    }

    return {
      record: existing,
      state: 'unchanged',
      text,
    };
  }

  commitSync(plan: LspDocumentSyncPlan): LspDocumentRecord {
    this.records.set(plan.record.filePath, plan.record);
    this.pathByUri.set(plan.record.uri, plan.record.filePath);
    return plan.record;
  }

  get(filePath: string): LspDocumentRecord | undefined {
    return this.records.get(path.resolve(filePath));
  }

  getByUri(uri: string): LspDocumentRecord | undefined {
    const filePath = this.pathByUri.get(uri);
    return filePath ? this.records.get(filePath) : undefined;
  }

  list(): LspDocumentRecord[] {
    return Array.from(this.records.values());
  }

  close(filePath: string): LspDocumentRecord | undefined {
    const resolvedPath = path.resolve(filePath);
    const existing = this.records.get(resolvedPath);
    if (!existing) {
      return undefined;
    }

    this.records.delete(resolvedPath);
    this.pathByUri.delete(existing.uri);
    return existing;
  }

  closeAll(): LspDocumentRecord[] {
    const records = this.list();
    this.records.clear();
    this.pathByUri.clear();
    return records;
  }

  size(): number {
    return this.records.size;
  }
}