import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {applyPatch as applyUnifiedPatch, parsePatch, reversePatch} from 'diff';

import {assessPath} from '../../safety/pathGuard.js';
import {AppError} from '../../utils/errors.js';
import {ensureDirectory, fileExists, readTextFile} from '../../utils/fs.js';
import {buildDiffPreview} from './diffPreview.js';
import {
  appendEditHistoryRecord,
  createEditBackup,
  loadEditBackup,
  loadEditHistory,
} from './editHistory.js';
import {getDisplayFilePath, hashContent, preserveLineEndings} from './patchEngine.js';
import type {AppliedPatchResult, EditHistoryRecord, RevertMethod, RevertPatchRequest} from './types.js';

const atomicWriteTextFile = async (filePath: string, content: string): Promise<void> => {
  await ensureDirectory(path.dirname(filePath));
  const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, content, 'utf8');
  await fs.rename(tempPath, filePath);
};

const resolveTargetRecord = (
  history: EditHistoryRecord[],
  request: RevertPatchRequest,
): EditHistoryRecord => {
  if (request.editId) {
    const record = history.find((candidate) => candidate.id === request.editId);
    if (!record) {
      throw new AppError(`No edit found for ${request.editId}.`, 'EDIT_HISTORY_NOT_FOUND');
    }
    return record;
  }

  if (request.filePath) {
    const normalized = request.filePath;
    const record = [...history].reverse().find((candidate) => candidate.filePath === normalized);
    if (!record) {
      throw new AppError(`No edit history found for ${normalized}.`, 'EDIT_HISTORY_NOT_FOUND');
    }
    return record;
  }

  const latest = history.at(-1);
  if (!latest) {
    throw new AppError('No edit history available to revert.', 'EDIT_HISTORY_EMPTY');
  }

  return latest;
};

const reconstructWithReverseDiff = (
  target: EditHistoryRecord,
  currentContent: string | null,
): {content: string | null; method: RevertMethod} | null => {
  if (target.operationType === 'create_file') {
    return {
      content: null,
      method: 'delete-created-file',
    };
  }

  const structuredPatch = parsePatch(target.diff)[0];
  if (!structuredPatch) {
    return null;
  }

  const reversedPatch = reversePatch(structuredPatch);
  const restoredContent = applyUnifiedPatch(currentContent ?? '', reversedPatch);
  if (restoredContent === false) {
    return null;
  }

  return {
    content: restoredContent,
    method: 'reverse-diff',
  };
};

const resolveRestoredContent = async (
  cwd: string,
  target: EditHistoryRecord,
  currentContent: string | null,
): Promise<{content: string | null; method: RevertMethod}> => {
  if (target.backupPath) {
    try {
      return {
        content: await loadEditBackup(cwd, target.backupPath),
        method: 'backup',
      };
    } catch {
      const fallback = reconstructWithReverseDiff(target, currentContent);
      if (fallback) {
        return fallback;
      }
    }
  }

  const reconstructed = reconstructWithReverseDiff(target, currentContent);
  if (reconstructed) {
    return reconstructed;
  }

  throw new AppError(
    'Could not reconstruct the previous file content for this revert.',
    'REVERT_RECONSTRUCTION_FAILED',
  );
};

export const revertPatchRequest = async (
  request: RevertPatchRequest,
): Promise<AppliedPatchResult> => {
  const history = await loadEditHistory(request.cwd);
  const target = resolveTargetRecord(history, request);
  const assessment = assessPath(request.cwd, target.filePath);
  const currentExists = await fileExists(assessment.resolvedPath);
  const currentContent = currentExists ? await readTextFile(assessment.resolvedPath) : null;
  const currentHash = hashContent(currentContent);

  if (currentHash !== target.newHash) {
    throw new AppError(
      'Target file no longer matches the edit you are trying to revert.',
      'REVERT_STALE_TARGET',
    );
  }

  const restoration = await resolveRestoredContent(request.cwd, target, currentContent);
  const normalizedRestoredContent = restoration.content === null
    ? null
    : preserveLineEndings(currentContent, restoration.content);
  const diffPreview = buildDiffPreview(
    getDisplayFilePath(assessment),
    currentContent ?? '',
    normalizedRestoredContent ?? '',
  );

  const approval = await request.approvalManager.request({
    diff: diffPreview.diff,
    kind: assessment.sensitive ? 'secret' : 'write',
    message: `Revert ${assessment.relativePath} to the state before edit ${target.id}.`,
    requiresExtraConfirmation: true,
    resource: assessment.resolvedPath,
    riskLevel: target.operationType === 'delete_file' || assessment.outsideProject || assessment.sensitive ? 'critical' : 'high',
    scope: assessment.sensitive ? 'secret' : assessment.outsideProject ? 'external' : 'project',
    title: 'Approve revert',
  });

  if (!approval.approved) {
    throw new AppError('Action was not approved.', 'APPROVAL_DENIED');
  }

  const editId = crypto.randomUUID();
  let backupPath: string | null = null;
  if (currentContent !== null) {
    backupPath = await createEditBackup(
      request.cwd,
      editId,
      assessment.outsideProject ? assessment.resolvedPath : assessment.relativePath,
      currentContent,
    );
  }

  if (normalizedRestoredContent === null) {
    await fs.rm(assessment.resolvedPath, {force: true});
  } else {
    await atomicWriteTextFile(assessment.resolvedPath, normalizedRestoredContent);
  }

  const filePath = assessment.outsideProject ? assessment.resolvedPath : assessment.relativePath;
  const newHash = hashContent(normalizedRestoredContent);
  await appendEditHistoryRecord(request.cwd, {
    addedLines: diffPreview.addedLines,
    approvalDecision: 'approved',
    backupPath,
    diff: diffPreview.fullDiff,
    filePath,
    id: editId,
    newHash,
    oldHash: currentHash,
    operationType: 'revert',
    promptOrGoal: request.promptOrGoal,
    removedLines: diffPreview.removedLines,
    revertMethod: restoration.method,
    revertedEditId: target.id,
    sessionId: request.sessionId,
    timestamp: new Date().toISOString(),
    toolIdentity: request.toolIdentity,
  });

  return {
    addedLines: diffPreview.addedLines,
    backupPath,
    diff: diffPreview.diff,
    editId,
    filePath,
    newHash,
    oldHash: currentHash,
    operation: 'revert',
    removedLines: diffPreview.removedLines,
    revertMethod: restoration.method,
  };
};
