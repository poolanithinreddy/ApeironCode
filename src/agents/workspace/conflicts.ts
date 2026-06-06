import type {MergeConflict, WorkspaceDiffFile} from './types.js';

export const createConflict = (
  file: WorkspaceDiffFile,
  type: MergeConflict['type'],
  reason: string,
): MergeConflict => ({
  path: file.path,
  reason,
  type,
});

export const hasMainChangedSinceBase = (file: WorkspaceDiffFile): boolean =>
  file.baseHash !== undefined && file.mainHash !== file.baseHash;

export const hasWorkspaceChangedSinceBase = (file: WorkspaceDiffFile): boolean =>
  file.baseHash !== undefined && file.workspaceHash !== file.baseHash;
