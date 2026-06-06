import type {ApprovalManager} from '../../safety/approvals.js';
import type {PathAssessment} from '../../safety/pathGuard.js';
import type {RiskLevel} from '../../safety/policy.js';

export type PatchMatchMode = 'all' | 'first' | 'unique';

export interface SearchReplaceOperation {
  type: 'search_replace';
  search: string;
  replace: string;
  occurrence?: PatchMatchMode;
}

export interface MultiReplaceOperation {
  type: 'multi_replace';
  replacements: Array<{
    search: string;
    replace: string;
    occurrence?: PatchMatchMode;
  }>;
}

export interface InsertBeforeOperation {
  type: 'insert_before';
  anchor: string;
  content: string;
  occurrence?: Exclude<PatchMatchMode, 'all'>;
}

export interface InsertAfterOperation {
  type: 'insert_after';
  anchor: string;
  content: string;
  occurrence?: Exclude<PatchMatchMode, 'all'>;
}

export interface AppendOperation {
  type: 'append';
  content: string;
}

export interface PrependOperation {
  type: 'prepend';
  content: string;
}

export interface FullRewriteOperation {
  type: 'full_rewrite';
  content: string;
}

export interface CreateFileOperation {
  type: 'create_file';
  content: string;
}

export interface DeleteFileOperation {
  type: 'delete_file';
}

export type PatchOperation =
  | AppendOperation
  | CreateFileOperation
  | DeleteFileOperation
  | FullRewriteOperation
  | InsertAfterOperation
  | InsertBeforeOperation
  | MultiReplaceOperation
  | PrependOperation
  | SearchReplaceOperation;

export type PatchOperationType = PatchOperation['type'] | 'revert';
export type RevertMethod = 'backup' | 'delete-created-file' | 'reverse-diff';

export interface DiffPreview {
  filePath: string;
  diff: string;
  fullDiff: string;
  addedLines: number;
  removedLines: number;
  isTruncated: boolean;
}

export interface EditHistoryRecord {
  id: string;
  timestamp: string;
  sessionId?: string;
  toolIdentity: string;
  operationType: PatchOperationType;
  filePath: string;
  oldHash: string | null;
  newHash: string | null;
  diff: string;
  addedLines: number;
  removedLines: number;
  approvalDecision: string;
  promptOrGoal?: string;
  backupPath?: string | null;
  revertedEditId?: string;
  revertMethod?: RevertMethod;
}

export interface PreparedPatch {
  assessment: PathAssessment;
  before: string | null;
  after: string | null;
  exists: boolean;
  operationType: PatchOperationType;
  diffPreview: DiffPreview;
  oldHash: string | null;
  riskLevel: RiskLevel;
}

export interface ApplyPatchRequest {
  approvalManager: ApprovalManager;
  allowOutsideWorkspace?: boolean;
  cwd: string;
  expectedOldHash?: string | null;
  inputPath: string;
  operations: PatchOperation[];
  promptOrGoal?: string;
  sessionId?: string;
  toolIdentity: string;
}

export interface AppliedPatchResult {
  editId: string;
  filePath: string;
  operation: PatchOperationType;
  diff: string;
  addedLines: number;
  removedLines: number;
  oldHash: string | null;
  newHash: string | null;
  backupPath?: string | null;
  revertMethod?: RevertMethod;
}

export interface RevertPatchRequest {
  approvalManager: ApprovalManager;
  cwd: string;
  editId?: string;
  filePath?: string;
  promptOrGoal?: string;
  sessionId?: string;
  toolIdentity: string;
  target?: 'last';
}
