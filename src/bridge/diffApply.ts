/**
 * ApeironCode bridge — diff apply flow.
 * Permission-gated apply. Approved requests execute via ToolRegistry (patch_file).
 */

import path from 'node:path';

import {AppError} from '../utils/errors.js';
import {createDefaultToolRegistry} from '../tools/registry.js';
import type {ToolResult} from '../tools/types.js';
import {ApprovalManager} from '../safety/approvals.js';
import {AuditLog} from '../safety/auditLog.js';
import {DEFAULT_CONFIG} from '../config/defaults.js';
import {redactBridgePayload} from './redaction.js';

const MAX_DIFF_PAYLOAD_CHARS = 50_000;
const RISKY_PATH_PATTERNS = [
  /package(-lock)?\.json$/i,
  /\.env(\.\w+)?$/i,
  /secrets?\.\w+$/i,
  /credentials?\.\w+$/i,
  /tsconfig.*\.json$/i,
  /\/\.git\//,
  /node_modules\//,
  /dist\//,
  /\.vsix$/,
  /Dockerfile/i,
  /docker-compose/i,
];

export type DiffApplyStatus =
  | 'approval_required'
  | 'applied'
  | 'denied'
  | 'failed'
  | 'unsupported';

export interface DiffApplyFile {
  path: string;
  additions: number;
  deletions: number;
  risky?: boolean;
}

export interface DiffApplyRequest {
  requestId: string;
  sessionId?: string;
  /** Workspace root for path resolution. */
  cwd?: string;
  files: DiffApplyFile[];
  /** Legacy unified/text patch — not executed (use patchOperations). */
  patch?: string;
  /** Structured operations for patch_file tool. */
  patchOperations?: unknown[];
  /** Whether user explicitly approved in IDE. */
  approved: boolean;
}

export interface DiffApplyResult {
  status: DiffApplyStatus;
  message: string;
  riskyPaths: string[];
  requestId: string;
  changedFiles?: string[];
  warnings?: string[];
}

/** Identifies risky file paths. */
export const isRiskyPath = (filePath: string): boolean =>
  RISKY_PATH_PATTERNS.some((p) => p.test(filePath));

/** True if path is safe workspace-relative (no traversal, not absolute). */
export const isSafeWorkspaceRelativePath = (filePath: string): boolean => {
  if (!filePath || filePath.length > 500) return false;
  if (filePath.includes('..')) return false;
  const normalized = path.posix.normalize(filePath.replace(/\\/gu, '/'));
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) return false;
  return true;
};

/** Validates a diff apply request payload. Returns a parsed request or error. */
export const validateDiffApplyPayload = (
  payload: Record<string, unknown>,
): {ok: true; value: DiffApplyRequest} | {ok: false; code: string; message: string} => {
  const requestId = typeof payload['requestId'] === 'string' ? payload['requestId'] : '';
  if (!requestId) return {ok: false, code: 'MISSING_REQUEST_ID', message: 'requestId required'};

  if (!Array.isArray(payload['files']) || payload['files'].length === 0) {
    return {ok: false, code: 'MISSING_FILES', message: 'files array required and must be non-empty'};
  }

  const patch = typeof payload['patch'] === 'string' ? payload['patch'] : undefined;
  if (patch && patch.length > MAX_DIFF_PAYLOAD_CHARS) {
    return {ok: false, code: 'DIFF_TOO_LARGE', message: `Diff too large (${patch.length} > ${MAX_DIFF_PAYLOAD_CHARS} chars)`};
  }

  const cwd = typeof payload['cwd'] === 'string' && payload['cwd'].length > 0 ? payload['cwd'] : undefined;

  const files: DiffApplyFile[] = (payload['files'] as unknown[]).map((f) => {
    const r = (typeof f === 'object' && f !== null ? f : {}) as Record<string, unknown>;
    const rawPath = r['path'];
    return {
      path: typeof rawPath === 'string' ? rawPath : '',
      additions: typeof r['additions'] === 'number' ? r['additions'] : 0,
      deletions: typeof r['deletions'] === 'number' ? r['deletions'] : 0,
    };
  });

  for (const file of files) {
    if (!file.path || !isSafeWorkspaceRelativePath(file.path)) {
      return {ok: false, code: 'INVALID_PATH', message: `Invalid file path: ${file.path.slice(0, 80)}`};
    }
  }

  let patchOperations: unknown[] | undefined;
  if (payload['patchOperations'] !== undefined) {
    if (!Array.isArray(payload['patchOperations'])) {
      return {ok: false, code: 'INVALID_PATCH_OPS', message: 'patchOperations must be an array when provided'};
    }
    patchOperations = payload['patchOperations'];
    if (patchOperations.length === 0) {
      return {ok: false, code: 'INVALID_PATCH_OPS', message: 'patchOperations must be non-empty'};
    }
    for (const op of patchOperations) {
      if (typeof op !== 'object' || op === null || typeof (op as Record<string, unknown>)['type'] !== 'string') {
        return {ok: false, code: 'INVALID_PATCH_OPS', message: 'Each patch operation must be an object with type'};
      }
    }
  }

  return {
    ok: true,
    value: {
      requestId,
      sessionId: typeof payload['sessionId'] === 'string' ? payload['sessionId'] : undefined,
      cwd,
      files,
      patch,
      patchOperations,
      approved: payload['approved'] === true,
    },
  };
};

const gatePreExecution = (request: DiffApplyRequest): DiffApplyResult | null => {
  const riskyPaths = request.files
    .filter((f) => isRiskyPath(f.path))
    .map((f) => f.path);

  if (riskyPaths.length > 0 && !request.approved) {
    return {
      status: 'approval_required',
      message: `Risky paths require explicit approval: ${riskyPaths.slice(0, 3).join(', ')}`,
      riskyPaths,
      requestId: request.requestId,
    };
  }

  if (!request.approved) {
    return {
      status: 'approval_required',
      message: 'Diff apply requires explicit user approval.',
      riskyPaths: [],
      requestId: request.requestId,
    };
  }

  if (request.patchOperations && request.files.length !== 1) {
    return {
      status: 'unsupported',
      message: 'Structured patch apply requires exactly one file entry matching the target path.',
      riskyPaths,
      requestId: request.requestId,
    };
  }

  return null;
};

export type PatchFileInvoker = (
  toolInput: Record<string, unknown>,
  cwd: string,
) => Promise<ToolResult>;

/** Default invoker: ToolRegistry.patch_file with bypass approvals (outer IDE already approved). */
export const createDefaultPatchFileInvoker = (): PatchFileInvoker => {
  const registry = createDefaultToolRegistry();
  const approvalManager = new ApprovalManager('bypass');
  registry.configureExecutor({
    approvalManager,
    globalPermissionRules: [],
    auditLog: new AuditLog(),
    sessionId: 'bridge-diff-apply',
  });

  return async (toolInput, cwd) =>
    registry.invoke('patch_file', toolInput, {
      cwd,
      config: DEFAULT_CONFIG,
      approvalManager,
      sessionId: 'bridge-diff-apply',
    });
};

const mapToolFailure = (err: unknown): DiffApplyResult['status'] => {
  if (err instanceof AppError) {
    if (err.code === 'PERMISSION_DENIED' || err.code === 'APPROVAL_DENIED') return 'denied';
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/not approved|denied|rejected/iu.test(msg)) return 'denied';
  return 'failed';
};

/**
 * Runs an approved diff apply through ToolRegistry (patch_file).
 * Requires patchOperations (structured patch_file operations). Raw unified diff alone is unsupported.
 */
export const executeDiffApplyRequest = async (
  request: DiffApplyRequest,
  cwd: string,
  invoker: PatchFileInvoker = createDefaultPatchFileInvoker(),
): Promise<DiffApplyResult> => {
  const gated = gatePreExecution(request);
  if (gated) return gated;

  const riskyPaths = request.files.filter((f) => isRiskyPath(f.path)).map((f) => f.path);
  const targetPath = request.files[0]?.path;
  if (!targetPath || !request.patchOperations?.length) {
    return {
      status: 'unsupported',
      message: request.patch
        ? 'Unified/text patch format is not supported for automatic apply. Use patchOperations (patch_file schema) or apply manually.'
        : 'No structured patchOperations provided.',
      riskyPaths,
      requestId: request.requestId,
    };
  }

  const toolInput: Record<string, unknown> = {
    path: targetPath,
    operations: request.patchOperations,
    dryRun: false,
    createIfMissing: false,
    allowOutsideWorkspace: false,
  };

  try {
    const result = await invoker(toolInput, cwd);
    if (!result.ok) {
      return {
        status: 'denied',
        message: result.summary.slice(0, 400) || 'Patch was not applied.',
        riskyPaths,
        requestId: request.requestId,
        warnings: [],
      };
    }

    const filePath = typeof result.metadata?.['filePath'] === 'string' ? result.metadata['filePath'] : targetPath;
    return {
      status: 'applied',
      message: result.summary.slice(0, 400),
      riskyPaths,
      requestId: request.requestId,
      changedFiles: [filePath],
      warnings: [],
    };
  } catch (err) {
    const status = mapToolFailure(err);
    const safe = err instanceof Error ? err.message.slice(0, 300) : 'Apply failed';
    return {
      status,
      message: status === 'denied' ? 'Permission denied for patch apply.' : safe,
      riskyPaths,
      requestId: request.requestId,
    };
  }
};

/** Formats a safe diff.apply_result payload. Never includes secrets or full patch echo. */
export const formatDiffApplyResultPayload = (result: DiffApplyResult): Record<string, unknown> =>
  redactBridgePayload({
    status: result.status,
    message: result.message.slice(0, 500),
    riskyPaths: result.riskyPaths.slice(0, 10),
    requestId: result.requestId,
    changedFiles: (result.changedFiles ?? []).slice(0, 20),
    warnings: (result.warnings ?? []).slice(0, 10),
  }) as Record<string, unknown>;
