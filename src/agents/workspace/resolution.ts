import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {execa} from 'execa';

import {ensureDirectory, readJsonFile, writeJsonFile} from '../../utils/fs.js';
import {getProjectConfigDir} from '../../utils/paths.js';
import {TeamEventLog} from '../eventLog.js';
import {SubagentWorkspaceManager} from './workspaceManager.js';
import type {MergeConflict, WorkspaceDiff, WorkspaceDiffFile} from './types.js';

export type MergeResolutionAction = 'apply' | 'manual' | 'skip';

export interface MergeResolutionEntry {
  action: MergeResolutionAction;
  file: string;
  resolvedAt: string;
}

export interface MergeResolutionState {
  entries: MergeResolutionEntry[];
  teamRunId: string;
}

const getTeamRunDir = (cwd: string, teamRunId: string): string =>
  path.join(getProjectConfigDir(cwd), 'team-runs', teamRunId);

const getResolutionPath = (cwd: string, teamRunId: string): string =>
  path.join(getTeamRunDir(cwd, teamRunId), 'resolutions.json');

const getPatchDir = (cwd: string, teamRunId: string): string =>
  path.join(getTeamRunDir(cwd, teamRunId), 'patches');

const timestampSlug = (): string => new Date().toISOString().replace(/[:.]/gu, '-');

export interface TeamPatchExportOptions {
  file?: string;
  includeConflicts?: boolean;
}

export interface TeamPatchValidationResult {
  checkedAt: string;
  command?: string;
  ok: boolean;
  skippedGitCheck: boolean;
  stderr?: string;
  stdout?: string;
}

export interface TeamPatchSidecar {
  conflicts: Array<{path: string; reason: string; type: string}>;
  createdAt: string;
  excludedFiles: Array<{path: string; reason: string}>;
  files: string[];
  patchPath: string;
  teamRunId: string;
  validated: boolean;
  validationResult?: TeamPatchValidationResult;
}

export const loadResolutionState = async (cwd: string, teamRunId: string): Promise<MergeResolutionState> =>
  readJsonFile<MergeResolutionState>(getResolutionPath(cwd, teamRunId), {entries: [], teamRunId});

export const saveResolutionState = async (
  cwd: string,
  state: MergeResolutionState,
): Promise<MergeResolutionState> => {
  await ensureDirectory(getTeamRunDir(cwd, state.teamRunId));
  await writeJsonFile(getResolutionPath(cwd, state.teamRunId), state);
  return state;
};

export const setResolution = async (
  cwd: string,
  teamRunId: string,
  file: string,
  action: MergeResolutionAction,
): Promise<MergeResolutionState> => {
  const state = await loadResolutionState(cwd, teamRunId);
  const next = {
    entries: [
      ...state.entries.filter((entry) => entry.file !== file),
      {action, file, resolvedAt: new Date().toISOString()},
    ],
    teamRunId,
  };
  return saveResolutionState(cwd, next);
};

export const formatResolutionState = (state: MergeResolutionState): string => {
  if (state.entries.length === 0) {
    return `Merge resolution: ${state.teamRunId}\nNo file resolutions recorded.`;
  }
  return [
    `Merge resolution: ${state.teamRunId}`,
    ...state.entries.map((entry) => `- ${entry.file}: ${entry.action} (${entry.resolvedAt})`),
  ].join('\n');
};

const copyFileIfExists = async (fromRoot: string, toRoot: string, relativePath: string): Promise<void> => {
  const source = path.join(fromRoot, relativePath);
  const content = await fs.readFile(source).catch(() => null);
  if (content === null) {
    return;
  }
  const destination = path.join(toRoot, relativePath);
  await ensureDirectory(path.dirname(destination));
  await fs.writeFile(destination, content);
};

const materializePatchTrees = async (
  tempRoot: string,
  diff: WorkspaceDiff,
  files: WorkspaceDiffFile[],
): Promise<void> => {
  const beforeRoot = path.join(tempRoot, 'a');
  const afterRoot = path.join(tempRoot, 'b');
  await Promise.all([ensureDirectory(beforeRoot), ensureDirectory(afterRoot)]);

  for (const file of files) {
    if (file.rename) {
      await copyFileIfExists(diff.workspace.mainRoot, beforeRoot, file.rename.oldPath);
      await copyFileIfExists(diff.workspace.workspaceRoot, afterRoot, file.rename.newPath);
      continue;
    }
    if (file.status !== 'added') {
      await copyFileIfExists(diff.workspace.mainRoot, beforeRoot, file.path);
    }
    if (file.status !== 'deleted') {
      await copyFileIfExists(diff.workspace.workspaceRoot, afterRoot, file.path);
    }
  }
};

const normalizeNoIndexPatch = (patch: string): string =>
  patch
    .replace(/^diff --git a\/[ab]\//gmu, 'diff --git a/')
    .replace(/ b\/[ab]\//gu, ' b/')
    .replace(/^--- a\/[ab]\//gmu, '--- a/')
    .replace(/^\+\+\+ b\/[ab]\//gmu, '+++ b/');

const createUnifiedPatch = async (diffs: Array<{diff: WorkspaceDiff; files: WorkspaceDiffFile[]}>): Promise<string> => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'apeironcode-team-patch-'));
  try {
    const beforeRoot = path.join(tempRoot, 'a');
    const afterRoot = path.join(tempRoot, 'b');
    await Promise.all([ensureDirectory(beforeRoot), ensureDirectory(afterRoot)]);
    for (const entry of diffs) {
      await materializePatchTrees(tempRoot, entry.diff, entry.files);
    }
    const result = await execa('git', ['diff', '--no-index', '--binary', '--', 'a', 'b'], {
      cwd: tempRoot,
      reject: false,
    });
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
    return normalizeNoIndexPatch(output.trimEnd());
  } finally {
    await fs.rm(tempRoot, {force: true, recursive: true});
  }
};

const sidecarPathForPatch = (patchPath: string): string => `${patchPath}.json`;

const isInside = (root: string, candidate: string): boolean => {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const latestPatchPath = async (cwd: string, teamRunId: string): Promise<string | null> => {
  const patchDir = getPatchDir(cwd, teamRunId);
  const entries = await fs.readdir(patchDir).catch(() => []);
  const patches = entries.filter((entry) => entry.endsWith('.patch')).sort();
  const latest = patches.at(-1);
  return latest ? path.join(patchDir, latest) : null;
};

const structuralValidatePatch = (content: string): TeamPatchValidationResult => ({
  checkedAt: new Date().toISOString(),
  ok: content.trim().length === 0 || (/^diff --git /mu.test(content) && /^--- (a\/|\/dev\/null)/mu.test(content) && /^\+\+\+ (b\/|\/dev\/null)/mu.test(content)),
  skippedGitCheck: true,
});

export const exportTeamPatch = async (
  cwd: string,
  teamRunId: string,
  options: TeamPatchExportOptions = {},
): Promise<string> => {
  const manager = new SubagentWorkspaceManager(cwd);
  const [plans, workspaces, resolution] = await Promise.all([
    manager.createMergePlan(teamRunId),
    manager.findByTeamRun(teamRunId),
    loadResolutionState(cwd, teamRunId),
  ]);
  const skipped = new Set(resolution.entries.filter((entry) => entry.action === 'skip' || entry.action === 'manual').map((entry) => entry.file));
  const conflicts = plans.flatMap((plan) => plan.conflictDetails ?? []);
  const conflictPaths = new Set(conflicts.map((conflict) => conflict.path));
  const excludedFiles: TeamPatchSidecar['excludedFiles'] = [];
  const patchDiffs: Array<{diff: WorkspaceDiff; files: WorkspaceDiffFile[]}> = [];

  for (const workspace of workspaces) {
    const diff = await manager.collectDiff(workspace);
    const plan = plans.find((candidate) => candidate.workspaceId === workspace.workspaceId);
    const cleanPaths = new Set((plan?.cleanFiles ?? []).map((file) => file.rename?.newPath ?? file.path));
    const candidateFiles = options.includeConflicts ? diff.files : plan?.cleanFiles ?? [];
    const selectedFiles = candidateFiles.filter((file) => {
      const canonicalPath = file.rename?.newPath ?? file.path;
      const oldPath = file.rename?.oldPath;
      if (options.file && canonicalPath !== options.file && oldPath !== options.file) {
        return false;
      }
      if (skipped.has(canonicalPath) || (oldPath && skipped.has(oldPath))) {
        excludedFiles.push({path: canonicalPath, reason: 'resolution marked skip/manual'});
        return false;
      }
      if (!options.includeConflicts && (conflictPaths.has(canonicalPath) || (oldPath && conflictPaths.has(oldPath)))) {
        excludedFiles.push({path: canonicalPath, reason: 'conflict excluded'});
        return false;
      }
      if (!options.includeConflicts && cleanPaths.size > 0 && !cleanPaths.has(canonicalPath)) {
        excludedFiles.push({path: canonicalPath, reason: 'not apply-ready'});
        return false;
      }
      if (file.binary) {
        excludedFiles.push({path: canonicalPath, reason: 'binary file excluded'});
        return false;
      }
      return true;
    });
    if (selectedFiles.length > 0) {
      patchDiffs.push({diff, files: selectedFiles});
    }
  }

  const patch = await createUnifiedPatch(patchDiffs);
  const patchPath = path.join(getPatchDir(cwd, teamRunId), `${timestampSlug()}.patch`);
  await ensureDirectory(path.dirname(patchPath));
  await fs.writeFile(patchPath, patch.length > 0 ? `${patch}\n` : '', 'utf8');
  const sidecar: TeamPatchSidecar = {
    conflicts: conflicts.map((conflict: MergeConflict) => ({
      path: conflict.path,
      reason: conflict.reason,
      type: conflict.type,
    })),
    createdAt: new Date().toISOString(),
    excludedFiles,
    files: patchDiffs.flatMap((entry) => entry.files.map((file) => file.rename ? `${file.rename.oldPath} -> ${file.rename.newPath}` : file.path)),
    patchPath,
    teamRunId,
    validated: false,
  };
  await writeJsonFile(sidecarPathForPatch(patchPath), sidecar);
  await new TeamEventLog(cwd).append({
    message: `Patch exported: ${path.relative(cwd, patchPath)} (${sidecar.files.length} file${sidecar.files.length === 1 ? '' : 's'})`,
    task: teamRunId,
    teamRunId,
    type: 'patch_exported',
  });
  return patchPath;
};

export const validateTeamPatch = async (
  cwd: string,
  teamRunId: string,
  patchPathInput?: string,
): Promise<TeamPatchValidationResult & {patchPath: string}> => {
  const patchPath = patchPathInput
    ? path.resolve(cwd, patchPathInput)
    : await latestPatchPath(cwd, teamRunId);
  if (!patchPath) {
    throw new Error(`No patch export found for ${teamRunId}. Run apeironcode team export-patch ${teamRunId} first.`);
  }
  const resolvedCwd = path.resolve(cwd);
  if (!isInside(resolvedCwd, patchPath)) {
    throw new Error('Patch validation only reads patch files inside the project root.');
  }
  const content = await fs.readFile(patchPath, 'utf8');
  const gitProbe = await execa('git', ['rev-parse', '--is-inside-work-tree'], {cwd, reject: false});
  const result: TeamPatchValidationResult = gitProbe.exitCode === 0
    ? {
        checkedAt: new Date().toISOString(),
        command: `git apply --check ${path.relative(cwd, patchPath)}`,
        ...await (async () => {
          const check = await execa('git', ['apply', '--check', patchPath], {cwd, reject: false});
          return {
            ok: check.exitCode === 0,
            skippedGitCheck: false,
            stderr: check.stderr || undefined,
            stdout: check.stdout || undefined,
          };
        })(),
      }
    : structuralValidatePatch(content);

  const sidecarPath = sidecarPathForPatch(patchPath);
  const sidecar = await readJsonFile<TeamPatchSidecar | null>(sidecarPath, null);
  if (sidecar) {
    await writeJsonFile(sidecarPath, {
      ...sidecar,
      validated: true,
      validationResult: result,
    });
  }
  await new TeamEventLog(cwd).append({
    message: `Patch validation ${result.ok ? 'passed' : 'failed'}: ${path.relative(cwd, patchPath)}`,
    task: teamRunId,
    teamRunId,
    type: 'patch_validated',
  });
  return {...result, patchPath};
};

export const formatPatchValidation = (result: TeamPatchValidationResult & {patchPath: string}): string => [
  `Patch validation: ${result.ok ? 'passed' : 'failed'}`,
  `Patch: ${result.patchPath}`,
  result.skippedGitCheck ? 'Git check: skipped (not inside a git repository); structural validation used.' : `Git check: ${result.command}`,
  result.stdout ? `stdout:\n${result.stdout}` : '',
  result.stderr ? `stderr:\n${result.stderr}` : '',
].filter(Boolean).join('\n');
