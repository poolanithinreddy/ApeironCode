import fs from 'node:fs/promises';
import path from 'node:path';

import {ensureDirectory} from '../../utils/fs.js';
import {createConflict, hasMainChangedSinceBase, hasWorkspaceChangedSinceBase} from './conflicts.js';
import type {MergeConflict, MergePlan, RenameChange, WorkspaceDiff, WorkspaceDiffFile} from './types.js';

const readBuffer = async (filePath: string): Promise<Buffer | null> =>
  fs.readFile(filePath).catch(() => null);

const lineConflict = async (diff: WorkspaceDiff, file: WorkspaceDiffFile): Promise<boolean> => {
  if (!hasMainChangedSinceBase(file) || !hasWorkspaceChangedSinceBase(file)) {
    return false;
  }
  const main = await readBuffer(path.join(diff.workspace.mainRoot, file.path));
  const isolated = await readBuffer(path.join(diff.workspace.workspaceRoot, file.path));
  if (!main || !isolated || main.includes(0) || isolated.includes(0)) {
    return true;
  }
  return main.toString('utf8') !== isolated.toString('utf8');
};

const textSimilarity = async (oldPath: string, newPath: string): Promise<number> => {
  const [oldContent, newContent] = await Promise.all([readBuffer(oldPath), readBuffer(newPath)]);
  if (!oldContent || !newContent || oldContent.includes(0) || newContent.includes(0)) {
    return 0;
  }
  const oldTokens = new Set(oldContent.toString('utf8').split(/\s+/u).filter(Boolean));
  const newTokens = new Set(newContent.toString('utf8').split(/\s+/u).filter(Boolean));
  if (oldTokens.size === 0 && newTokens.size === 0) {
    return 1;
  }
  const intersection = Array.from(oldTokens).filter((token) => newTokens.has(token)).length;
  const union = new Set([...oldTokens, ...newTokens]).size;
  return union === 0 ? 0 : intersection / union;
};

const detectRenames = async (diff: WorkspaceDiff): Promise<Array<{added: WorkspaceDiffFile; deleted: WorkspaceDiffFile; rename: RenameChange}>> => {
  const added = diff.files.filter((file) => file.workspaceHash !== null && !file.baseHash);
  const deleted = diff.files.filter((file) => file.status === 'deleted');
  const pairs: Array<{added: WorkspaceDiffFile; deleted: WorkspaceDiffFile; rename: RenameChange}> = [];
  const usedAdded = new Set<string>();

  for (const deletedFile of deleted) {
    let best: {file: WorkspaceDiffFile; score: number} | null = null;
    for (const addedFile of added) {
      if (usedAdded.has(addedFile.path)) {
        continue;
      }
      const score = deletedFile.baseHash && deletedFile.baseHash === addedFile.workspaceHash
        ? 1
        : await textSimilarity(
          path.join(diff.workspace.mainRoot, deletedFile.path),
          path.join(diff.workspace.workspaceRoot, addedFile.path),
        );
      if (!best || score > best.score) {
        best = {file: addedFile, score};
      }
    }
    if (best && best.score >= 0.82) {
      usedAdded.add(best.file.path);
      pairs.push({
        added: best.file,
        deleted: deletedFile,
        rename: {
          hasContentChanges: deletedFile.baseHash !== best.file.workspaceHash,
          newPath: best.file.path,
          oldPath: deletedFile.path,
          similarity: Math.round(best.score * 100) / 100,
          source: 'heuristic',
        },
      });
    }
  }
  return pairs;
};

export const createMergePlan = async (diff: WorkspaceDiff): Promise<MergePlan> => {
  const cleanFiles: WorkspaceDiffFile[] = [];
  const skippedFiles: WorkspaceDiffFile[] = [];
  const binaryFiles: WorkspaceDiffFile[] = [];
  const conflictDetails: MergeConflict[] = [];
  const renames = await detectRenames(diff);
  const renameConflicts: MergeConflict[] = [];
  const renamedPaths = new Set(renames.flatMap((entry) => [entry.added.path, entry.deleted.path]));

  for (const {added, deleted, rename} of renames) {
    const targetPath = path.join(diff.workspace.mainRoot, rename.newPath);
    const targetExists = await readBuffer(targetPath);
    if (deleted.mainHash !== deleted.baseHash) {
      const conflict = createConflict(deleted, 'rename-source-changed', 'Main workspace changed the rename source after isolation.');
      conflictDetails.push(conflict);
      renameConflicts.push(conflict);
      continue;
    }
    if (targetExists && added.mainHash !== null) {
      const conflict = createConflict(added, 'rename-target', 'Rename target already exists in main workspace.');
      conflictDetails.push(conflict);
      renameConflicts.push(conflict);
      continue;
    }
    cleanFiles.push({
      ...added,
      rename,
      status: 'renamed',
    });
  }

  for (const file of diff.files) {
    if (renamedPaths.has(file.path)) {
      continue;
    }
    if (file.binary) {
      binaryFiles.push(file);
      conflictDetails.push(createConflict(file, 'binary', 'Binary files are not applied automatically.'));
      continue;
    }

    if (file.status === 'added') {
      if (file.mainHash !== null) {
        conflictDetails.push(createConflict(file, 'main-changed', 'File exists in main while isolated workspace also added it.'));
      } else {
        cleanFiles.push(file);
      }
      continue;
    }

    if (file.status === 'deleted') {
      if (file.mainHash !== file.baseHash) {
        conflictDetails.push(createConflict(file, 'main-changed', 'Main workspace changed this file after isolation while the subagent deleted it.'));
      } else {
        cleanFiles.push(file);
      }
      continue;
    }

    if (file.mainHash === null) {
      conflictDetails.push(createConflict(file, 'deleted-in-main', 'Main workspace deleted this file after isolation.'));
      continue;
    }

    if (file.workspaceHash === null) {
      conflictDetails.push(createConflict(file, 'deleted-in-workspace', 'Isolated workspace deleted this file unexpectedly.'));
      continue;
    }

    if (await lineConflict(diff, file)) {
      conflictDetails.push(createConflict(file, 'same-line', 'Main and isolated workspace both changed this file since the base snapshot.'));
      continue;
    }

    if (hasMainChangedSinceBase(file)) {
      skippedFiles.push(file);
      continue;
    }

    cleanFiles.push(file);
  }

  return {
    binaryFiles,
    cleanFiles,
    conflictDetails,
    conflicts: conflictDetails.map((conflict) => conflict.path),
    createdAt: new Date().toISOString(),
    files: diff.files,
    ignoredFiles: diff.ignoredFiles,
    requiresApproval: cleanFiles.length > 0,
    renameConflicts,
    renames: renames.map((entry) => entry.rename),
    skippedFiles,
    teamRunId: diff.workspace.teamRunId,
    workspaceId: diff.workspace.workspaceId,
  };
};

export const applyMergePlan = async (diff: WorkspaceDiff, plan?: MergePlan): Promise<string[]> => {
  plan ??= await createMergePlan(diff);
  if (plan.conflictDetails?.length) {
    throw new Error(`Merge conflicts detected: ${plan.conflictDetails.map((conflict) => `${conflict.path} (${conflict.type})`).join(', ')}`);
  }

  const applied: string[] = [];
  for (const file of plan.cleanFiles ?? diff.files) {
    const mainPath = path.join(diff.workspace.mainRoot, file.rename?.newPath ?? file.path);
    const workspacePath = path.join(diff.workspace.workspaceRoot, file.path);
    if (file.status === 'renamed' && file.rename) {
      const oldMainPath = path.join(diff.workspace.mainRoot, file.rename.oldPath);
      await ensureDirectory(path.dirname(mainPath));
      const content = await readBuffer(path.join(diff.workspace.workspaceRoot, file.rename.newPath));
      if (!content) {
        continue;
      }
      await fs.writeFile(mainPath, content);
      await fs.rm(oldMainPath, {force: true});
      applied.push(`${file.rename.oldPath} -> ${file.rename.newPath}`);
      continue;
    }
    if (file.status === 'deleted') {
      await fs.rm(mainPath, {force: true});
      applied.push(file.path);
      continue;
    }
    const content = await readBuffer(workspacePath);
    if (!content) {
      continue;
    }
    await ensureDirectory(path.dirname(mainPath));
    await fs.writeFile(mainPath, content);
    applied.push(file.path);
  }
  return applied;
};
