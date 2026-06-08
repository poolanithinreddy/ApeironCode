import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {AppError} from '../../utils/errors.js';
import {ensureDirectory, fileExists, readTextFile} from '../../utils/fs.js';
import {appendEditHistoryRecord, createEditBackup} from './editHistory.js';
import {hashContent, preparePatch} from './patchEngine.js';
import type {AppliedPatchResult, ApplyPatchRequest} from './types.js';

const atomicWriteTextFile = async (filePath: string, content: string): Promise<void> => {
  await ensureDirectory(path.dirname(filePath));
  const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, content, 'utf8');
  await fs.rename(tempPath, filePath);
};

export const applyPatchRequest = async (
  request: ApplyPatchRequest,
): Promise<AppliedPatchResult> => {
  const prepared = await preparePatch(request);
  const approval = await request.approvalManager.request({
    diff: prepared.diffPreview.diff,
    kind: prepared.assessment.sensitive ? 'secret' : 'write',
    message: `${prepared.operationType === 'delete_file' ? 'Delete' : prepared.exists ? 'Update' : 'Create'} ${prepared.assessment.relativePath}.`,
    requiresExtraConfirmation: prepared.operationType === 'delete_file' || prepared.assessment.outsideProject || prepared.assessment.sensitive,
    resource: prepared.assessment.resolvedPath,
    riskLevel: prepared.riskLevel,
    scope: prepared.assessment.sensitive ? 'secret' : prepared.assessment.outsideProject ? 'external' : 'project',
    title: prepared.operationType === 'delete_file' ? 'Approve file delete' : 'Approve file patch',
  });

  if (!approval.approved) {
    throw new AppError('Action was not approved.', 'APPROVAL_DENIED');
  }

  const currentExists = await fileExists(prepared.assessment.resolvedPath);
  const currentBefore = currentExists ? await readTextFile(prepared.assessment.resolvedPath) : null;
  if (hashContent(currentBefore) !== prepared.oldHash) {
    throw new AppError('Target file changed after the diff preview was generated.', 'PATCH_STALE_TARGET');
  }

  const editId = crypto.randomUUID();
  let backupPath: string | null = null;
  if (prepared.before !== null) {
    backupPath = await createEditBackup(
      request.cwd,
      editId,
      prepared.assessment.outsideProject ? prepared.assessment.resolvedPath : prepared.assessment.relativePath,
      prepared.before,
    );
  }

  if (prepared.after === null) {
    await fs.rm(prepared.assessment.resolvedPath, {force: true});
  } else {
    await atomicWriteTextFile(prepared.assessment.resolvedPath, prepared.after);
  }

  const newHash = hashContent(prepared.after);
  const filePath = prepared.assessment.outsideProject
    ? prepared.assessment.resolvedPath
    : prepared.assessment.relativePath;

  await appendEditHistoryRecord(request.cwd, {
    addedLines: prepared.diffPreview.addedLines,
    approvalDecision: 'approved',
    backupPath,
    diff: prepared.diffPreview.fullDiff,
    filePath,
    id: editId,
    newHash,
    oldHash: prepared.oldHash,
    operationType: prepared.operationType,
    promptOrGoal: request.promptOrGoal,
    removedLines: prepared.diffPreview.removedLines,
    sessionId: request.sessionId,
    timestamp: new Date().toISOString(),
    toolIdentity: request.toolIdentity,
  });

  return {
    addedLines: prepared.diffPreview.addedLines,
    backupPath,
    diff: prepared.diffPreview.diff,
    editId,
    filePath,
    newHash,
    oldHash: prepared.oldHash,
    operation: prepared.operationType,
    removedLines: prepared.diffPreview.removedLines,
  };
};
