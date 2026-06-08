import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {fileExists} from '../../utils/fs.js';
import type {SubagentWorkspace, WorkspaceDiff, WorkspaceDiffFile, WorkspaceFileSnapshot} from './types.js';
import {loadWorkspaceIgnoreRules} from './ignoreRules.js';

const IGNORE_NAMES = new Set(['.git', '.apeironcode-agent', 'dist', 'node_modules']);

const listRelativeFiles = async (root: string, current = root): Promise<string[]> => {
  const entries = await fs.readdir(current, {withFileTypes: true}).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    if (IGNORE_NAMES.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listRelativeFiles(root, fullPath));
      continue;
    }
    if (entry.isFile()) {
      files.push(path.relative(root, fullPath));
    }
  }
  return files.sort();
};

const readFileSnapshot = async (root: string, relativePath: string): Promise<WorkspaceFileSnapshot> => {
  const filePath = path.join(root, relativePath);
  if (!(await fileExists(filePath))) {
    return {binary: false, hash: null, path: relativePath};
  }
  const content = await fs.readFile(filePath).catch(() => null);
  if (!content) {
    return {binary: false, hash: null, path: relativePath};
  }
  return {
    binary: content.includes(0),
    hash: crypto.createHash('sha256').update(content).digest('hex'),
    path: relativePath,
  };
};

export const collectWorkspaceSnapshot = async (root: string): Promise<WorkspaceFileSnapshot[]> => {
  const files = await listRelativeFiles(root);
  return Promise.all(files.map((relativePath) => readFileSnapshot(root, relativePath)));
};

export const collectWorkspaceDiff = async (workspace: SubagentWorkspace): Promise<WorkspaceDiff> => {
  if (workspace.mode === 'main') {
    return {files: [], workspace};
  }
  const ignoreRules = await loadWorkspaceIgnoreRules(workspace.mainRoot);
  const [mainFiles, workspaceFiles] = await Promise.all([
    listRelativeFiles(workspace.mainRoot),
    listRelativeFiles(workspace.workspaceRoot),
  ]);
  const allFiles = Array.from(new Set([...mainFiles, ...workspaceFiles])).sort();
  const files: WorkspaceDiffFile[] = [];
  const ignoredFiles: NonNullable<WorkspaceDiff['ignoredFiles']> = [];
  const baseByPath = new Map((workspace.baseSnapshot ?? []).map((entry) => [entry.path, entry]));
  for (const relativePath of allFiles) {
    const ignored = ignoreRules.matches(relativePath);
    if (ignored) {
      ignoredFiles.push(ignored);
      continue;
    }
    const [mainSnapshot, workspaceSnapshot] = await Promise.all([
      readFileSnapshot(workspace.mainRoot, relativePath),
      readFileSnapshot(workspace.workspaceRoot, relativePath),
    ]);
    if (mainSnapshot.hash === workspaceSnapshot.hash) {
      continue;
    }
    const baseSnapshot = baseByPath.get(relativePath);
    files.push({
      baseHash: baseSnapshot?.hash,
      binary: Boolean(baseSnapshot?.binary || mainSnapshot.binary || workspaceSnapshot.binary),
      mainHash: mainSnapshot.hash,
      path: relativePath,
      status: mainSnapshot.hash === null ? 'added' : workspaceSnapshot.hash === null ? 'deleted' : 'modified',
      workspaceHash: workspaceSnapshot.hash,
    });
  }
  return {files, ignoredFiles, workspace};
};
