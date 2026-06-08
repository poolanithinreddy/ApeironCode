import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import {redactSecretLikeContent} from '../memory/safety.js';
import {ensureDirectory, fileExists, readJsonFile, writeJsonFile} from '../utils/fs.js';
import {getProjectConfigDir, isSubPath} from '../utils/paths.js';

export interface CheckpointFileSnapshot {
  existed: boolean;
  path: string;
  size: number;
  skipped?: 'binary' | 'huge';
  content?: string;
}

export interface RuntimeCheckpoint {
  changedFiles: string[];
  createdAt: string;
  cwd: string;
  files: CheckpointFileSnapshot[];
  id: string;
  reason: string;
  runId?: string;
  sessionId?: string;
}

export interface CheckpointOptions {
  changedFiles?: string[];
  maxFileBytes?: number;
  reason?: string;
  runId?: string;
  sessionId?: string;
}

const DEFAULT_MAX_FILE_BYTES = 512 * 1024;
const EXCLUDED_DIRS = new Set(['.git', '.apeironcode-agent', 'node_modules', 'dist', 'coverage']);

const checkpointRoot = (cwd: string): string => path.join(getProjectConfigDir(cwd), 'runtime', 'checkpoints');
const checkpointPath = (cwd: string, id: string): string => path.join(checkpointRoot(cwd), `${id}.json`);

const isBinary = (buffer: Buffer): boolean => buffer.subarray(0, 8000).includes(0);

const listWorkspaceFiles = async (cwd: string, dir = cwd): Promise<string[]> => {
  const entries = await fs.readdir(dir, {withFileTypes: true});
  const files: string[] = [];
  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (!isSubPath(cwd, fullPath)) continue;
    if (entry.isDirectory()) {
      files.push(...await listWorkspaceFiles(cwd, fullPath));
    } else if (entry.isFile()) {
      files.push(path.relative(cwd, fullPath));
    }
  }
  return files;
};

const snapshotFile = async (
  cwd: string,
  relativePath: string,
  maxFileBytes: number,
): Promise<CheckpointFileSnapshot> => {
  const resolved = path.resolve(cwd, relativePath);
  if (!isSubPath(cwd, resolved)) {
    return {existed: false, path: relativePath, size: 0, skipped: 'huge'};
  }
  if (!(await fileExists(resolved))) {
    return {existed: false, path: relativePath, size: 0};
  }

  const stat = await fs.stat(resolved);
  if (stat.size > maxFileBytes) {
    return {existed: true, path: relativePath, size: stat.size, skipped: 'huge'};
  }
  const buffer = await fs.readFile(resolved);
  if (isBinary(buffer)) {
    return {existed: true, path: relativePath, size: stat.size, skipped: 'binary'};
  }
  return {content: buffer.toString('utf8'), existed: true, path: relativePath, size: stat.size};
};

export const createCheckpoint = async (
  cwd: string,
  options: CheckpointOptions = {},
): Promise<RuntimeCheckpoint> => {
  const id = `cp_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
  const changedFiles = Array.from(new Set(options.changedFiles?.length ? options.changedFiles : await listWorkspaceFiles(cwd))).sort();
  const checkpoint: RuntimeCheckpoint = {
    changedFiles,
    createdAt: new Date().toISOString(),
    cwd,
    files: await Promise.all(changedFiles.map((file) => snapshotFile(cwd, file, options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES))),
    id,
    reason: redactSecretLikeContent(options.reason ?? 'runtime checkpoint'),
    runId: options.runId,
    sessionId: options.sessionId,
  };
  await writeJsonFile(checkpointPath(cwd, id), checkpoint);
  return checkpoint;
};

export const listCheckpoints = async (cwd: string): Promise<RuntimeCheckpoint[]> => {
  try {
    const files = (await fs.readdir(checkpointRoot(cwd))).filter((file) => file.endsWith('.json'));
    const checkpoints = await Promise.all(files.map((file) => readJsonFile<RuntimeCheckpoint | null>(path.join(checkpointRoot(cwd), file), null)));
    return checkpoints.filter((checkpoint): checkpoint is RuntimeCheckpoint => Boolean(checkpoint)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
};

export const restoreCheckpoint = async (
  checkpoint: RuntimeCheckpoint,
): Promise<{restored: string[]; removed: string[]; skipped: string[]}> => {
  const currentFiles = new Set(await listWorkspaceFiles(checkpoint.cwd));
  const snapshotFiles = new Set(checkpoint.files.map((file) => file.path));
  const restored: string[] = [];
  const removed: string[] = [];
  const skipped: string[] = [];

  for (const file of checkpoint.files) {
    const target = path.resolve(checkpoint.cwd, file.path);
    if (!isSubPath(checkpoint.cwd, target) || file.skipped) {
      skipped.push(file.path);
      continue;
    }
    if (!file.existed) {
      await fs.rm(target, {force: true});
      removed.push(file.path);
      continue;
    }
    await ensureDirectory(path.dirname(target));
    await fs.writeFile(target, file.content ?? '', 'utf8');
    restored.push(file.path);
  }

  for (const file of currentFiles) {
    if (!snapshotFiles.has(file)) {
      await fs.rm(path.resolve(checkpoint.cwd, file), {force: true});
      removed.push(file);
    }
  }

  return {removed, restored, skipped};
};

export const deleteCheckpoint = async (checkpoint: RuntimeCheckpoint): Promise<void> => {
  await fs.rm(checkpointPath(checkpoint.cwd, checkpoint.id), {force: true});
};

export const getChangedFilesSinceCheckpoint = async (checkpoint: RuntimeCheckpoint): Promise<string[]> => {
  const changed = new Set<string>();
  const files = await listWorkspaceFiles(checkpoint.cwd);
  const snapshot = new Map(checkpoint.files.map((file) => [file.path, file]));
  for (const file of files) {
    const current = await snapshotFile(checkpoint.cwd, file, DEFAULT_MAX_FILE_BYTES);
    const previous = snapshot.get(file);
    if (!previous || previous.content !== current.content || previous.existed !== current.existed) {
      changed.add(file);
    }
  }
  for (const file of checkpoint.files) {
    if (!(await fileExists(path.resolve(checkpoint.cwd, file.path)))) changed.add(file.path);
  }
  return [...changed].sort();
};

export const formatCheckpointSummary = (checkpoint: RuntimeCheckpoint): string =>
  redactSecretLikeContent([
    `Checkpoint ${checkpoint.id}`,
    `Reason: ${checkpoint.reason}`,
    `Files: ${checkpoint.files.length}`,
    `Skipped: ${checkpoint.files.filter((file) => file.skipped).length}`,
    checkpoint.sessionId ? `Session: ${checkpoint.sessionId}` : '',
  ].filter(Boolean).join('\n'));
