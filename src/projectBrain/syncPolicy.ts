import {getProjectTrustStatus} from '../safety/projectTrust.js';
import {fileExists} from '../utils/fs.js';
import path from 'node:path';
import {PROJECT_BRAIN_DIR} from './types.js';
import {redactProjectBrainText} from './safety.js';

export type ProjectBrainSyncMode = 'off' | 'ask' | 'auto-safe';

export type ProjectBrainSyncEventKind =
  | 'run-completed'
  | 'run-failed'
  | 'task-completed'
  | 'task-failed'
  | 'manual';

export interface ProjectBrainSyncEvent {
  kind: ProjectBrainSyncEventKind;
  cwd: string;
  hasSecrets?: boolean;
  isLargeUpdate?: boolean;
}

export interface ProjectBrainSyncDecisionOptions {
  mode?: ProjectBrainSyncMode;
}

export type ProjectBrainSyncAction =
  | 'allow-runs-append'
  | 'show-preview'
  | 'refuse'
  | 'require-approval';

export interface ProjectBrainSyncDecision {
  action: ProjectBrainSyncAction;
  reason: string;
  safeToAutoWrite: boolean;
}

const PROTECTED_FILES = ['PROJECT.md', 'PLAN.md', 'TASKS.md', 'DECISIONS.md'];

export const isProtectedFile = (relativePath: string): boolean =>
  PROTECTED_FILES.some((f) => relativePath.endsWith(f));

export const getProjectBrainSyncDecision = async (
  event: ProjectBrainSyncEvent,
  options: ProjectBrainSyncDecisionOptions = {},
): Promise<ProjectBrainSyncDecision> => {
  const mode = options.mode ?? 'ask';

  if (mode === 'off') {
    return {action: 'refuse', reason: 'Sync mode is off.', safeToAutoWrite: false};
  }

  if (event.hasSecrets) {
    return {action: 'refuse', reason: 'Refused: potential secrets detected in run data.', safeToAutoWrite: false};
  }

  const brainExists = await fileExists(path.join(event.cwd, PROJECT_BRAIN_DIR, 'manifest.json'));
  if (!brainExists) {
    return {
      action: 'refuse',
      reason: 'Project Brain not initialized. Run `apeironcode brain plan` first.',
      safeToAutoWrite: false,
    };
  }

  if (event.isLargeUpdate) {
    return {
      action: 'require-approval',
      reason: 'Large update requires explicit approval.',
      safeToAutoWrite: false,
    };
  }

  const trust = getProjectTrustStatus(event.cwd).trust;
  if (trust !== 'trusted' && mode === 'auto-safe') {
    return {
      action: 'show-preview',
      reason: 'Project not trusted — showing preview only.',
      safeToAutoWrite: false,
    };
  }

  if (mode === 'ask') {
    return {
      action: 'show-preview',
      reason: 'Mode is ask — showing preview. Approve with `brain sync --yes`.',
      safeToAutoWrite: false,
    };
  }

  // auto-safe: only RUNS.md append is allowed
  if (event.kind === 'run-completed' || event.kind === 'run-failed') {
    return {
      action: 'allow-runs-append',
      reason: 'auto-safe: appending run summary to RUNS.md.',
      safeToAutoWrite: true,
    };
  }

  return {
    action: 'show-preview',
    reason: 'Event kind requires approval in auto-safe mode.',
    safeToAutoWrite: false,
  };
};

export const formatProjectBrainSyncDecision = (decision: ProjectBrainSyncDecision): string =>
  redactProjectBrainText([
    `Sync action: ${decision.action}`,
    `Reason: ${decision.reason}`,
    `Auto-write safe: ${decision.safeToAutoWrite ? 'yes' : 'no'}`,
  ].join('\n'));
