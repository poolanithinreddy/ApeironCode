import path from 'node:path';

import {fileExists, readTextFile, writeTextFile} from '../utils/fs.js';
import {PROJECT_BRAIN_DIR} from './types.js';
import {redactProjectBrainText} from './safety.js';
import {backupProjectBrainFile} from './writer.js';
import {extractRunFacts, formatExtractedRunFacts, type RunExtractorInput} from './runExtractor.js';
import {getProjectBrainSyncDecision, type ProjectBrainSyncMode} from './syncPolicy.js';

export interface ProjectBrainAutoSyncOptions {
  mode?: ProjectBrainSyncMode;
  approved?: boolean;
  cwd: string;
}

export interface ProjectBrainSyncPreview {
  cwd: string;
  runsAppend?: string;
  verifyAppend?: string;
  tasksAppend?: string;
  planAppend?: string;
  requiresApproval: boolean;
  safeToAutoWrite: boolean;
  decisionReason: string;
  timestamp: string;
}

export interface ProjectBrainSyncResult {
  ok: boolean;
  runsUpdated: boolean;
  verifyUpdated: boolean;
  tasksUpdated: boolean;
  planUpdated: boolean;
  backedUp: string[];
  skipped: string[];
  message: string;
}

const RUNS_PATH = (cwd: string): string => path.join(cwd, PROJECT_BRAIN_DIR, 'RUNS.md');
const VERIFY_PATH = (cwd: string): string => path.join(cwd, PROJECT_BRAIN_DIR, 'VERIFY.md');

export const createProjectBrainSyncPreview = async (
  input: RunExtractorInput,
  options: ProjectBrainAutoSyncOptions,
): Promise<ProjectBrainSyncPreview> => {
  const {cwd} = options;
  const timestamp = new Date().toISOString();

  const decision = await getProjectBrainSyncDecision(
    {
      kind: 'run-completed',
      cwd,
      hasSecrets: false,
    },
    {mode: options.mode ?? 'ask'},
  );

  if (decision.action === 'refuse') {
    return {
      cwd,
      requiresApproval: true,
      safeToAutoWrite: false,
      decisionReason: decision.reason,
      timestamp,
    };
  }

  const facts = extractRunFacts({...input, timestamp});
  const runsAppend = formatExtractedRunFacts(facts);

  // VERIFY.md only when we have reliable validation data
  const verifyAppend = facts.validationResult && facts.commandsRun.length > 0
    ? redactProjectBrainText(
        `\n## ${timestamp}\nValidation: ${facts.validationResult}\nCommands: ${facts.commandsRun.join(', ')}\n`,
      )
    : undefined;

  return {
    cwd,
    runsAppend,
    verifyAppend,
    requiresApproval: !decision.safeToAutoWrite,
    safeToAutoWrite: decision.safeToAutoWrite,
    decisionReason: decision.reason,
    timestamp,
  };
};

export const applyProjectBrainSync = async (
  preview: ProjectBrainSyncPreview,
  options: {approved?: boolean; dryRun?: boolean} = {},
): Promise<ProjectBrainSyncResult> => {
  const {cwd} = preview;
  const approved = options.approved ?? false;
  const dryRun = options.dryRun ?? false;

  if (!preview.safeToAutoWrite && !approved) {
    return {
      ok: false,
      runsUpdated: false,
      verifyUpdated: false,
      tasksUpdated: false,
      planUpdated: false,
      backedUp: [],
      skipped: ['RUNS.md', 'VERIFY.md'],
      message: `Sync requires approval. ${preview.decisionReason}`,
    };
  }

  const backedUp: string[] = [];
  const skipped: string[] = [];
  let runsUpdated = false;
  let verifyUpdated = false;

  // RUNS.md — safe append
  if (preview.runsAppend) {
    const runsPath = RUNS_PATH(cwd);
    if (await fileExists(runsPath)) {
      if (!dryRun) {
        const existing = await readTextFile(runsPath);
        await writeTextFile(runsPath, `${existing.trimEnd()}\n\n${preview.runsAppend}`);
      }
      runsUpdated = true;
    } else {
      skipped.push('RUNS.md (file missing)');
    }
  }

  // VERIFY.md — only with reliable data and approval
  if (preview.verifyAppend && approved) {
    const verifyPath = VERIFY_PATH(cwd);
    if (await fileExists(verifyPath)) {
      if (!dryRun) {
        const bak = await backupProjectBrainFile(verifyPath, {approved: true});
        if (bak) backedUp.push(path.relative(cwd, bak));
        const existing = await readTextFile(verifyPath);
        await writeTextFile(verifyPath, `${existing.trimEnd()}\n${preview.verifyAppend}`);
      }
      verifyUpdated = true;
    } else {
      skipped.push('VERIFY.md (file missing)');
    }
  }

  const msg = dryRun
    ? `Dry run: RUNS.md=${runsUpdated}, VERIFY.md=${verifyUpdated}`
    : `Sync applied: RUNS.md=${runsUpdated}, VERIFY.md=${verifyUpdated}`;

  return {
    ok: true,
    runsUpdated,
    verifyUpdated,
    tasksUpdated: false,
    planUpdated: false,
    backedUp,
    skipped,
    message: redactProjectBrainText(msg),
  };
};

export const maybeSyncProjectBrainAfterRun = async (
  input: RunExtractorInput,
  options: ProjectBrainAutoSyncOptions,
): Promise<{preview?: ProjectBrainSyncPreview; result?: ProjectBrainSyncResult; hint?: string}> => {
  const {cwd, mode = 'ask', approved = false} = options;

  const brainExists = await fileExists(path.join(cwd, PROJECT_BRAIN_DIR, 'manifest.json'));
  if (!brainExists) {
    return {hint: 'No Project Brain found. Run `apeironcode brain plan` to set one up.'};
  }

  const preview = await createProjectBrainSyncPreview(input, {cwd, mode});

  if (mode === 'off') return {hint: 'Project Brain sync is off.'};

  if (mode === 'auto-safe' && preview.safeToAutoWrite && !input.prompt?.toLowerCase().includes('secret')) {
    const result = await applyProjectBrainSync(preview, {approved: true});
    return {preview, result};
  }

  if (mode === 'ask' || (mode === 'auto-safe' && !preview.safeToAutoWrite)) {
    if (approved) {
      const result = await applyProjectBrainSync(preview, {approved: true});
      return {preview, result};
    }
    return {preview, hint: `Run sync preview shown. Approve with \`brain sync --yes\`. ${preview.decisionReason}`};
  }

  return {preview};
};

export const formatProjectBrainSyncPreview = (preview: ProjectBrainSyncPreview): string =>
  redactProjectBrainText([
    `Project Brain Sync Preview — ${preview.timestamp}`,
    `Decision: ${preview.decisionReason}`,
    `Requires approval: ${preview.requiresApproval ? 'yes' : 'no'}`,
    `Safe to auto-write: ${preview.safeToAutoWrite ? 'yes' : 'no'}`,
    '',
    preview.runsAppend ? `RUNS.md append:\n${preview.runsAppend}` : 'RUNS.md: no changes',
    preview.verifyAppend ? `VERIFY.md append:\n${preview.verifyAppend}` : '',
  ].filter(Boolean).join('\n'));

export const formatProjectBrainSyncResult = (result: ProjectBrainSyncResult): string =>
  redactProjectBrainText([
    `Sync result: ${result.ok ? 'ok' : 'failed'}`,
    result.message,
    `Updated: RUNS.md=${result.runsUpdated}, VERIFY.md=${result.verifyUpdated}`,
    result.backedUp.length > 0 ? `Backups: ${result.backedUp.join(', ')}` : '',
    result.skipped.length > 0 ? `Skipped: ${result.skipped.join(', ')}` : '',
  ].filter(Boolean).join('\n'));
