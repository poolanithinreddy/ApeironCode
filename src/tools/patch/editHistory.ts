import path from 'node:path';

import {ensureDirectory, fileExists, readTextFile, writeTextFile} from '../../utils/fs.js';
import {
  getProjectBackupDir,
  getProjectEditHistoryPath,
} from '../../utils/paths.js';
import type {EditHistoryRecord} from './types.js';

export interface EditHistoryQueryOptions {
  filePath?: string;
  limit?: number;
  sessionId?: string;
}

const sanitizeFileName = (value: string): string => {
  return value
    .replace(/^\.+/u, '')
    .replace(/[\\/]+/gu, '__')
    .replace(/[^A-Za-z0-9._-]/gu, '_');
};

export const createEditBackup = async (
  cwd: string,
  editId: string,
  filePath: string,
  content: string,
): Promise<string> => {
  const backupDir = getProjectBackupDir(cwd);
  const relativeBackupPath = path.join('.apeironcode-agent', 'history', 'backups', `${editId}__${sanitizeFileName(filePath)}.bak`);
  const absoluteBackupPath = path.join(cwd, relativeBackupPath);
  await ensureDirectory(backupDir);
  await writeTextFile(absoluteBackupPath, content);
  return relativeBackupPath;
};

export const appendEditHistoryRecord = async (
  cwd: string,
  record: EditHistoryRecord,
): Promise<void> => {
  const historyPath = getProjectEditHistoryPath(cwd);
  await ensureDirectory(path.dirname(historyPath));
  const prefix = await fileExists(historyPath) ? await readTextFile(historyPath) : '';
  const next = `${prefix}${JSON.stringify(record)}\n`;
  await writeTextFile(historyPath, next);
};

export const loadEditHistory = async (cwd: string): Promise<EditHistoryRecord[]> => {
  const historyPath = getProjectEditHistoryPath(cwd);
  if (!(await fileExists(historyPath))) {
    return [];
  }

  const raw = await readTextFile(historyPath);
  return raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as EditHistoryRecord);
};

export const queryEditHistory = async (
  cwd: string,
  options: EditHistoryQueryOptions = {},
): Promise<EditHistoryRecord[]> => {
  const limit = options.limit && options.limit > 0 ? options.limit : Number.POSITIVE_INFINITY;
  return (await loadEditHistory(cwd))
    .filter((record) => (options.filePath ? record.filePath === options.filePath : true))
    .filter((record) => (options.sessionId ? record.sessionId === options.sessionId : true))
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, limit);
};

export const loadEditBackup = async (
  cwd: string,
  backupPath: string,
): Promise<string> => {
  return readTextFile(path.join(cwd, backupPath));
};
