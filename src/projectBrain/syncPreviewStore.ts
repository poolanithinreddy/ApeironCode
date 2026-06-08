import path from 'node:path';
import fs from 'node:fs/promises';

import {fileExists, readJsonFile, writeTextFile, ensureDirectory} from '../utils/fs.js';
import {redactProjectBrainText} from './safety.js';
import {createProjectRootFingerprint} from './safety.js';
import {PROJECT_BRAIN_DIR} from './types.js';
import type {ProjectBrainSyncPreview} from './autoSync.js';

const PREVIEW_DIR = (cwd: string): string =>
  path.join(cwd, PROJECT_BRAIN_DIR, 'runs', 'sync-previews');

const MAX_PREVIEW_SIZE_CHARS = 8_000;
const MAX_STORED_PREVIEWS = 10;

export interface StoredSyncPreview {
  id: string;
  createdAt: string;
  cwdFingerprint: string;
  targetFiles: string[];
  changesSummary: string;
  riskLevel: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
  sourceRunId?: string;
  preview: ProjectBrainSyncPreview;
}

export interface SaveSyncPreviewOptions {
  sourceRunId?: string;
  riskLevel?: 'low' | 'medium' | 'high';
}

export interface LoadSyncPreviewOptions {
  maxAgeDays?: number;
}

const assessRisk = (preview: ProjectBrainSyncPreview): 'low' | 'medium' | 'high' => {
  if (preview.planAppend || preview.tasksAppend) return 'high';
  if (preview.verifyAppend) return 'medium';
  return 'low';
};

const summarizePreview = (preview: ProjectBrainSyncPreview): string => {
  const parts: string[] = [];
  if (preview.runsAppend) parts.push('RUNS.md: append run summary');
  if (preview.verifyAppend) parts.push('VERIFY.md: append verification');
  if (preview.tasksAppend) parts.push('TASKS.md: update tasks');
  if (preview.planAppend) parts.push('PLAN.md: update plan');
  return parts.length > 0 ? parts.join('; ') : 'no changes';
};

const listTargetFiles = (preview: ProjectBrainSyncPreview): string[] => {
  const files: string[] = [];
  if (preview.runsAppend) files.push('.apeironcode/RUNS.md');
  if (preview.verifyAppend) files.push('.apeironcode/VERIFY.md');
  if (preview.tasksAppend) files.push('.apeironcode/TASKS.md');
  if (preview.planAppend) files.push('.apeironcode/PLAN.md');
  return files;
};

const truncatePreview = (preview: ProjectBrainSyncPreview): ProjectBrainSyncPreview => ({
  ...preview,
  runsAppend: preview.runsAppend ? preview.runsAppend.slice(0, 2_000) : undefined,
  verifyAppend: preview.verifyAppend ? preview.verifyAppend.slice(0, 1_000) : undefined,
  tasksAppend: preview.tasksAppend ? preview.tasksAppend.slice(0, 1_000) : undefined,
  planAppend: preview.planAppend ? preview.planAppend.slice(0, 1_000) : undefined,
});

export const saveSyncPreview = async (
  cwd: string,
  preview: ProjectBrainSyncPreview,
  options: SaveSyncPreviewOptions = {},
): Promise<StoredSyncPreview | null> => {
  const brainExists = await fileExists(path.join(cwd, PROJECT_BRAIN_DIR, 'manifest.json'));
  if (!brainExists) return null;

  const dir = PREVIEW_DIR(cwd);
  await ensureDirectory(dir);

  const id = `preview-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const stored: StoredSyncPreview = {
    id,
    createdAt: new Date().toISOString(),
    cwdFingerprint: createProjectRootFingerprint(cwd),
    targetFiles: listTargetFiles(preview),
    changesSummary: redactProjectBrainText(summarizePreview(preview)),
    riskLevel: options.riskLevel ?? assessRisk(preview),
    requiresApproval: preview.requiresApproval,
    sourceRunId: options.sourceRunId,
    preview: truncatePreview(preview),
  };

  const filePath = path.join(dir, `${id}.json`);
  const safe = redactProjectBrainText(JSON.stringify(stored, null, 2));
  if (safe.length > MAX_PREVIEW_SIZE_CHARS) return null;
  await writeTextFile(filePath, safe);

  // Prune old previews
  await pruneOldPreviews(dir);

  return stored;
};

const pruneOldPreviews = async (dir: string): Promise<void> => {
  try {
    const files = (await fs.readdir(dir))
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse();
    for (const file of files.slice(MAX_STORED_PREVIEWS)) {
      await fs.unlink(path.join(dir, file)).catch(() => undefined);
    }
  } catch {
    // best effort
  }
};

export const loadLatestSyncPreview = async (
  cwd: string,
  options: LoadSyncPreviewOptions = {},
): Promise<StoredSyncPreview | null> => {
  const dir = PREVIEW_DIR(cwd);
  if (!(await fileExists(dir))) return null;
  const files = (await fs.readdir(dir).catch(() => [] as string[]))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse();
  for (const file of files) {
    const stored = await readJsonFile<StoredSyncPreview | null>(path.join(dir, file), null);
    if (!stored) continue;
    if (options.maxAgeDays) {
      const ageMs = Date.now() - new Date(stored.createdAt).getTime();
      if (ageMs > options.maxAgeDays * 86_400_000) continue;
    }
    if (stored.cwdFingerprint !== createProjectRootFingerprint(cwd)) continue;
    return stored;
  }
  return null;
};

export const getSyncPreview = async (
  id: string,
  cwd: string,
): Promise<StoredSyncPreview | null> => {
  const filePath = path.join(PREVIEW_DIR(cwd), `${id}.json`);
  return readJsonFile<StoredSyncPreview | null>(filePath, null);
};

export const listSyncPreviews = async (cwd: string): Promise<StoredSyncPreview[]> => {
  const dir = PREVIEW_DIR(cwd);
  if (!(await fileExists(dir))) return [];
  const files = (await fs.readdir(dir).catch(() => [] as string[]))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse();
  const results: StoredSyncPreview[] = [];
  for (const file of files.slice(0, MAX_STORED_PREVIEWS)) {
    const stored = await readJsonFile<StoredSyncPreview | null>(path.join(dir, file), null);
    if (stored) results.push(stored);
  }
  return results;
};

export const deleteSyncPreview = async (id: string, cwd: string): Promise<boolean> => {
  const filePath = path.join(PREVIEW_DIR(cwd), `${id}.json`);
  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
};

export const isPreviewStale = async (stored: StoredSyncPreview, cwd: string): Promise<boolean> => {
  for (const rel of stored.targetFiles) {
    const abs = path.join(cwd, rel);
    try {
      const stat = await fs.stat(abs);
      const previewTime = new Date(stored.createdAt).getTime();
      if (stat.mtimeMs > previewTime) return true;
    } catch {
      // file missing — treat as stale
      return true;
    }
  }
  return false;
};

export const formatSyncPreviewList = (previews: StoredSyncPreview[]): string => {
  if (previews.length === 0) return 'No saved sync previews.';
  const lines = previews.map((p) => [
    `ID: ${p.id}`,
    `Created: ${p.createdAt}`,
    `Risk: ${p.riskLevel}`,
    `Files: ${p.targetFiles.join(', ')}`,
    `Summary: ${p.changesSummary}`,
    '---',
  ].join('\n'));
  return redactProjectBrainText(lines.join('\n'));
};
