/**
 * Persistent store for background tasks (Phase 16D).
 * Stores tasks as JSON files under .apeironcode-agent/bg-tasks/<id>.json.
 * No daemon required. No secrets in stored data.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {ensureDirectory, readJsonFile, writeJsonFile} from '../utils/fs.js';
import {getProjectBgTasksDir} from '../utils/paths.js';
import {redactSecrets} from '../share/redactor.js';
import type {
  BgTask,
  BgTaskFilter,
  BgTaskKind,
  BgTaskIsolation,
  BgTaskLog,
  BgTaskStatus,
} from './bgTask.js';
import {appendLog} from './bgTask.js';

export interface CreateBgTaskInput {
  title: string;
  kind: BgTaskKind;
  cwd: string;
  prompt?: string;
  command?: string;
  agentName?: string;
  skillNames?: string[];
  workflowCommandName?: string;
  isolation?: BgTaskIsolation;
  metadata?: Record<string, string | number | boolean>;
}

export class BgTaskStore {
  constructor(private readonly cwd: string) {}

  private dir(): string {
    return getProjectBgTasksDir(this.cwd);
  }

  private taskPath(id: string): string {
    return path.join(this.dir(), `${id}.json`);
  }

  createId(): string {
    return crypto.randomUUID();
  }

  async createTask(input: CreateBgTaskInput): Promise<BgTask> {
    const now = new Date().toISOString();
    const task: BgTask = {
      id: this.createId(),
      title: input.title.slice(0, 200),
      kind: input.kind,
      status: 'queued',
      cwd: input.cwd,
      createdAt: now,
      updatedAt: now,
      prompt: input.prompt ? redactSecrets(input.prompt) : undefined,
      command: input.command ? redactSecrets(input.command) : undefined,
      agentName: input.agentName,
      skillNames: input.skillNames,
      workflowCommandName: input.workflowCommandName,
      isolation: input.isolation ?? 'none',
      logs: [],
      metadata: input.metadata,
    };
    await this.save(task);
    return task;
  }

  async save(task: BgTask): Promise<void> {
    await ensureDirectory(this.dir());
    await writeJsonFile(this.taskPath(task.id), task);
  }

  async getTask(id: string): Promise<BgTask | null> {
    return readJsonFile<BgTask | null>(this.taskPath(id), null);
  }

  async listTasks(filter?: BgTaskFilter): Promise<BgTask[]> {
    try {
      const entries = await fs.readdir(this.dir());
      const tasks = await Promise.all(
        entries
          .filter((e) => e.endsWith('.json'))
          .map((e) => readJsonFile<BgTask | null>(path.join(this.dir(), e), null)),
      );
      let result = tasks.filter((t): t is BgTask => t !== null);

      if (filter?.status) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
        result = result.filter((t) => statuses.includes(t.status));
      }
      if (filter?.kind) {
        const kinds = Array.isArray(filter.kind) ? filter.kind : [filter.kind];
        result = result.filter((t) => kinds.includes(t.kind));
      }

      return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch {
      return [];
    }
  }

  async updateTask(id: string, patch: Partial<BgTask>): Promise<BgTask | null> {
    const task = await this.getTask(id);
    if (!task) return null;
    const updated: BgTask = {
      ...task,
      ...patch,
      id: task.id, // never allow id override
      cwd: task.cwd,
      updatedAt: new Date().toISOString(),
    };
    await this.save(updated);
    return updated;
  }

  async appendTaskLog(id: string, log: BgTaskLog): Promise<BgTask | null> {
    const task = await this.getTask(id);
    if (!task) return null;
    const safeLog: BgTaskLog = {
      ...log,
      message: redactSecrets(log.message),
    };
    const updated = appendLog(task, safeLog);
    await this.save(updated);
    return updated;
  }

  async deleteTask(id: string): Promise<boolean> {
    try {
      await fs.rm(this.taskPath(id), {force: true});
      return true;
    } catch {
      return false;
    }
  }

  async updateStatus(id: string, status: BgTaskStatus, extra?: Partial<BgTask>): Promise<BgTask | null> {
    const now = new Date().toISOString();
    const patch: Partial<BgTask> = {status, ...extra};
    if (status === 'running' && !extra?.startedAt) patch.startedAt = now;
    if (status === 'succeeded' || status === 'failed' || status === 'stopped' || status === 'cancelled') {
      if (!extra?.completedAt) patch.completedAt = now;
    }
    return this.updateTask(id, patch);
  }
}
