import {redactProjectBrainText} from './safety.js';
import type {ExtractedRunFacts} from './runExtractor.js';
import type {BgTaskFacts} from './taskPlanSync.js';
import {createProjectRootFingerprint} from './safety.js';

export interface BrainMergeOperation {
  kind: 'checkbox-done' | 'checkbox-fail' | 'append-progress' | 'append-blocker' | 'append-verify';
  target: string;
  matchedLine?: string;
  proposedLine?: string;
  appendSection?: string;
}

export interface BrainFileMergePreview {
  id: string;
  targetFile: string;
  originalText: string;
  proposedText: string;
  operations: BrainMergeOperation[];
  hasChanges: boolean;
  timestamp: string;
  cwdFingerprint: string;
  requiresApproval: boolean;
  backupRequired: boolean;
}

export interface BrainMergeApplyResult {
  applied: boolean;
  backedUp: boolean;
  backupPath?: string;
  stale: boolean;
  message: string;
}

export interface BrainMergeOptions {
  cwd?: string;
  preserveManualNotes?: boolean;
  force?: boolean;
}

const TODO_RE = /^(\s*)-\s+\[ \]\s+(.+)$/u;

const matchesTask = (lineText: string, taskTitle: string): boolean => {
  const a = lineText.toLowerCase().slice(0, 80);
  const b = taskTitle.toLowerCase().slice(0, 80);
  return a.includes(b.slice(0, 40)) || b.includes(a.slice(0, 40));
};

export const createTasksMergePreview = (
  tasksText: string,
  taskFacts: BgTaskFacts,
  options: BrainMergeOptions = {},
): BrainFileMergePreview => {
  const id = `tasks-${Date.now()}`;
  const timestamp = new Date().toISOString();
  const fingerprint = options.cwd ? createProjectRootFingerprint(options.cwd) : 'unknown';
  const operations: BrainMergeOperation[] = [];
  let proposedText = tasksText;
  let matched = false;

  const lines = tasksText.split('\n');
  const updatedLines = lines.map((line) => {
    const todo = TODO_RE.exec(line);
    if (todo?.[2] && matchesTask(todo[2], taskFacts.title)) {
      matched = true;
      if (taskFacts.status === 'succeeded') {
        const newLine = line.replace('- [ ]', '- [x]');
        operations.push({kind: 'checkbox-done', target: '.apeironcode/TASKS.md', matchedLine: line, proposedLine: newLine});
        return newLine;
      }
      if (taskFacts.status === 'failed' && taskFacts.errorSummary) {
        const blockerNote = `  <!-- Blocker: ${redactProjectBrainText(taskFacts.errorSummary.slice(0, 150))} -->`;
        operations.push({kind: 'checkbox-fail', target: '.apeironcode/TASKS.md', matchedLine: line, proposedLine: `${line}\n${blockerNote}`});
        return `${line}\n${blockerNote}`;
      }
    }
    return line;
  });

  if (!matched) {
    const progressEntry = `\n<!-- Task result (${taskFacts.status}): ${redactProjectBrainText(taskFacts.title)} — ${redactProjectBrainText(taskFacts.outputSummary?.slice(0, 100) ?? '')} -->`;
    operations.push({kind: 'append-progress', target: '.apeironcode/TASKS.md', appendSection: progressEntry});
    proposedText = redactProjectBrainText(`${updatedLines.join('\n')}${progressEntry}`);
  } else {
    proposedText = redactProjectBrainText(updatedLines.join('\n'));
  }

  return {
    id,
    targetFile: '.apeironcode/TASKS.md',
    originalText: tasksText,
    proposedText,
    operations,
    hasChanges: proposedText !== tasksText,
    timestamp,
    cwdFingerprint: fingerprint,
    requiresApproval: true,
    backupRequired: matched,
  };
};

export const createPlanMergePreview = (
  planText: string,
  runFacts: ExtractedRunFacts,
  options: BrainMergeOptions = {},
): BrainFileMergePreview => {
  const id = `plan-${Date.now()}`;
  const timestamp = new Date().toISOString();
  const fingerprint = options.cwd ? createProjectRootFingerprint(options.cwd) : 'unknown';
  const operations: BrainMergeOperation[] = [];

  const entry = [
    ``,
    `## Recent Progress — ${timestamp.slice(0, 10)}`,
    ``,
    runFacts.promptSummary ? `> Task: ${runFacts.promptSummary.slice(0, 120)}` : '',
    `> Result: ${runFacts.validationResult.slice(0, 120)}`,
    runFacts.changedFiles.length > 0 ? `> Files: ${runFacts.changedFiles.slice(0, 5).join(', ')}` : '',
    runFacts.blockers.length > 0 ? `> Blockers: ${runFacts.blockers.slice(0, 2).join('; ')}` : '',
    runFacts.nextSteps.length > 0 ? `> Next: ${runFacts.nextSteps[0]}` : '',
    '',
  ].filter((l) => l !== undefined).join('\n');

  // Find existing Recent Progress section or append
  let proposedText: string;
  if (planText.includes('## Recent Progress')) {
    const idx = planText.lastIndexOf('## Recent Progress');
    proposedText = redactProjectBrainText(planText.slice(0, idx).trimEnd() + entry + '\n' + planText.slice(idx));
    operations.push({kind: 'append-progress', target: '.apeironcode/PLAN.md', appendSection: entry});
  } else {
    proposedText = redactProjectBrainText(`${planText.trimEnd()}\n${entry}`);
    operations.push({kind: 'append-progress', target: '.apeironcode/PLAN.md', appendSection: entry});
  }

  return {
    id,
    targetFile: '.apeironcode/PLAN.md',
    originalText: planText,
    proposedText,
    operations,
    hasChanges: proposedText !== planText,
    timestamp,
    cwdFingerprint: fingerprint,
    requiresApproval: true,
    backupRequired: true,
  };
};

export const createBrainFileMergePreview = (
  existingText: string,
  proposedUpdate: string,
  options: BrainMergeOptions & {targetFile?: string} = {},
): BrainFileMergePreview => {
  const timestamp = new Date().toISOString();
  const fingerprint = options.cwd ? createProjectRootFingerprint(options.cwd) : 'unknown';
  const proposed = redactProjectBrainText(`${existingText.trimEnd()}\n\n${proposedUpdate.trim()}\n`);
  return {
    id: `merge-${Date.now()}`,
    targetFile: options.targetFile ?? '.apeironcode/unknown',
    originalText: existingText,
    proposedText: proposed,
    operations: [{kind: 'append-progress', target: options.targetFile ?? '.apeironcode/unknown', appendSection: proposedUpdate}],
    hasChanges: proposed !== existingText,
    timestamp,
    cwdFingerprint: fingerprint,
    requiresApproval: true,
    backupRequired: true,
  };
};

export const applyBrainMergePreview = async (
  preview: BrainFileMergePreview,
  options: {approved?: boolean; dryRun?: boolean; cwd?: string},
): Promise<BrainMergeApplyResult> => {
  if (!options.approved) {
    return {applied: false, backedUp: false, stale: false, message: 'Approval required to apply merge.'};
  }
  if (!options.cwd) {
    return {applied: false, backedUp: false, stale: false, message: 'cwd required.'};
  }

  const {readTextFile, writeTextFile} = await import('../utils/fs.js');
  const {backupProjectBrainFile} = await import('./writer.js');
  const path = await import('node:path');

  const absPath = path.join(options.cwd, preview.targetFile);
  let currentText: string;
  try {
    currentText = await readTextFile(absPath);
  } catch {
    return {applied: false, backedUp: false, stale: false, message: `File not found: ${preview.targetFile}`};
  }

  // Stale check — if file changed since preview was created
  if (!options.approved || currentText !== preview.originalText) {
    if (!options.approved) {
      return {applied: false, backedUp: false, stale: false, message: 'Approval required.'};
    }
    const isForced = (options as {force?: boolean}).force;
    if (!isForced) {
      return {applied: false, backedUp: false, stale: true, message: `File changed since preview was created. Re-run sync-preview or use --force.`};
    }
  }

  let backupPath: string | undefined;
  if (preview.backupRequired && !options.dryRun) {
    const bak = await backupProjectBrainFile(absPath, {approved: true});
    backupPath = bak ?? undefined;
  }

  if (!options.dryRun) {
    await writeTextFile(absPath, preview.proposedText);
  }

  return {
    applied: true,
    backedUp: !!backupPath,
    backupPath,
    stale: false,
    message: options.dryRun ? 'Dry run — no changes written.' : `Applied ${preview.operations.length} operation(s) to ${preview.targetFile}.`,
  };
};

export const formatBrainMergePreview = (preview: BrainFileMergePreview): string =>
  redactProjectBrainText([
    `Brain Merge Preview — ${preview.targetFile}`,
    `ID: ${preview.id}`,
    `Has changes: ${preview.hasChanges ? 'yes' : 'no'}`,
    `Requires approval: ${preview.requiresApproval ? 'yes' : 'no'}`,
    `Backup required: ${preview.backupRequired ? 'yes' : 'no'}`,
    `Operations (${preview.operations.length}):`,
    ...preview.operations.map((op) => `  [${op.kind}] ${op.matchedLine?.slice(0, 60) ?? op.appendSection?.slice(0, 60) ?? ''}`),
    '',
    `Proposed changes preview:`,
    preview.proposedText.slice(0, 600),
  ].join('\n'));
