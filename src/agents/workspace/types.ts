export type SubagentWorkspaceMode = 'git-worktree' | 'main' | 'temp-copy';

export interface SubagentWorkspace {
  agentName: string;
  baseSnapshot?: WorkspaceFileSnapshot[];
  cleanup: boolean;
  createdAt: string;
  git?: {
    branchName?: string;
    detached: boolean;
    repoRoot: string;
  };
  mainRoot: string;
  mode: SubagentWorkspaceMode;
  status: 'active' | 'applied' | 'discarded' | 'planned';
  teamRunId: string;
  workspaceId: string;
  workspaceRoot: string;
}

export interface WorkspaceDiffFile {
  baseHash?: string | null;
  binary?: boolean;
  mainHash?: string | null;
  path: string;
  rename?: RenameChange;
  status: 'added' | 'deleted' | 'modified' | 'renamed';
  workspaceHash?: string | null;
}

export interface WorkspaceDiff {
  files: WorkspaceDiffFile[];
  ignoredFiles?: Array<{
    path: string;
    rule: string;
    source: 'builtin' | 'gitignore' | 'apeironcodeignore' | 'opencodeignore';
  }>;
  workspace: SubagentWorkspace;
}

export interface WorkspaceFileSnapshot {
  binary: boolean;
  hash: string | null;
  path: string;
}

export type MergeConflictType =
  | 'binary'
  | 'deleted-in-main'
  | 'deleted-in-workspace'
  | 'main-changed'
  | 'rename-target'
  | 'rename-source-changed'
  | 'same-line';

export interface MergeConflict {
  path: string;
  reason: string;
  type: MergeConflictType;
}

export interface MergePlan {
  binaryFiles?: WorkspaceDiffFile[];
  cleanFiles?: WorkspaceDiffFile[];
  conflictDetails?: MergeConflict[];
  conflicts: string[];
  createdAt: string;
  files: WorkspaceDiffFile[];
  ignoredFiles?: WorkspaceDiff['ignoredFiles'];
  requiresApproval: boolean;
  renames?: RenameChange[];
  renameConflicts?: MergeConflict[];
  skippedFiles?: WorkspaceDiffFile[];
  teamRunId: string;
  workspaceId: string;
}

export interface RenameChange {
  hasContentChanges: boolean;
  newPath: string;
  oldPath: string;
  similarity: number;
  source: 'git' | 'heuristic';
}
