import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {ensureDirectory, readJsonFile, writeJsonFile} from '../utils/fs.js';
import {getProjectTasksDir} from '../utils/paths.js';
import type {TaskPlan, TaskPlanStatus} from './types.js';

export type TaskSelectionFallback = 'latest' | 'latest-incomplete' | 'latest-incomplete-or-latest';

export class TaskStore {
  constructor(private readonly cwd: string) {}

  createId(): string {
    return crypto.randomUUID();
  }

  private getTaskPath(taskId: string): string {
    return path.join(getProjectTasksDir(this.cwd), `${taskId}.json`);
  }

  async save(task: TaskPlan): Promise<void> {
    await ensureDirectory(getProjectTasksDir(this.cwd));
    await writeJsonFile(this.getTaskPath(task.id), task);
  }

  async load(taskId: string): Promise<TaskPlan | null> {
    return readJsonFile<TaskPlan | null>(this.getTaskPath(taskId), null);
  }

  async list(): Promise<TaskPlan[]> {
    const dir = getProjectTasksDir(this.cwd);
    try {
      const entries = await fs.readdir(dir);
      const tasks = await Promise.all(
        entries
          .filter((entry) => entry.endsWith('.json'))
          .map((entry) => readJsonFile<TaskPlan | null>(path.join(dir, entry), null)),
      );
      return tasks
        .filter((task): task is TaskPlan => task !== null)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    } catch {
      return [];
    }
  }

  async clear(): Promise<number> {
    const tasks = await this.list();
    await Promise.all(tasks.map((task) => fs.rm(this.getTaskPath(task.id), {force: true})));
    return tasks.length;
  }

  async delete(taskId: string): Promise<boolean> {
    try {
      await fs.rm(this.getTaskPath(taskId), {force: true});
      return true;
    } catch {
      return false;
    }
  }

  async getLatest(): Promise<TaskPlan | null> {
    return (await this.list())[0] ?? null;
  }

  async getLatestIncomplete(): Promise<TaskPlan | null> {
    return (await this.list()).find((task) => task.status !== 'completed') ?? null;
  }

  async resolve(
    taskId?: string,
    options?: {fallback?: TaskSelectionFallback},
  ): Promise<TaskPlan | null> {
    if (taskId) {
      return this.load(taskId);
    }

    switch (options?.fallback ?? 'latest-incomplete-or-latest') {
      case 'latest':
        return this.getLatest();
      case 'latest-incomplete':
        return this.getLatestIncomplete();
      default:
        return (await this.getLatestIncomplete()) ?? this.getLatest();
    }
  }

  async update(taskId: string, updater: (task: TaskPlan) => TaskPlan): Promise<TaskPlan | null> {
    const task = await this.load(taskId);
    if (!task) {
      return null;
    }

    const next = updater(task);
    next.updatedAt = new Date().toISOString();
    await this.save(next);
    return next;
  }

  async setStatus(taskId: string, status: TaskPlanStatus): Promise<TaskPlan | null> {
    return this.update(taskId, (task) => ({
      ...task,
      status,
    }));
  }
}
