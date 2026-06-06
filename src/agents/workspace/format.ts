import type {MergePlan, SubagentWorkspace, WorkspaceDiff} from './types.js';

export const formatWorkspace = (workspace: SubagentWorkspace): string => [
  `${workspace.workspaceId} | ${workspace.mode} | ${workspace.status} | ${workspace.agentName}`,
  `  root: ${workspace.workspaceRoot}`,
  `  team: ${workspace.teamRunId}`,
].join('\n');

export const formatWorkspaces = (workspaces: SubagentWorkspace[]): string =>
  workspaces.length === 0 ? 'No subagent workspaces recorded.' : workspaces.map(formatWorkspace).join('\n');

export const formatWorkspaceDiff = (diff: WorkspaceDiff): string => {
  if (diff.files.length === 0) {
    return `${diff.workspace.workspaceId}: no changes`;
  }
  return [
    `${diff.workspace.workspaceId}: ${diff.files.length} changed file${diff.files.length === 1 ? '' : 's'}`,
    ...diff.files.map((file) => `- ${file.status}: ${file.path}`),
    diff.ignoredFiles?.length ? `Ignored files: ${diff.ignoredFiles.length}` : undefined,
  ].filter(Boolean).join('\n');
};

export const formatIgnoredFiles = (diffs: WorkspaceDiff[]): string => {
  const rows = diffs.flatMap((diff) => (diff.ignoredFiles ?? []).map((ignored) => ({
    ...ignored,
    workspaceId: diff.workspace.workspaceId,
  })));
  if (rows.length === 0) {
    return 'No ignored workspace files recorded.';
  }
  return [
    `Ignored workspace files: ${rows.length}`,
    ...rows.map((row) => `- ${row.path} | ${row.source}:${row.rule} | ${row.workspaceId}`),
  ].join('\n');
};

export const formatMergePlans = (plans: MergePlan[]): string => {
  if (plans.length === 0) {
    return 'No workspaces found for this team run.';
  }
  return plans.map((plan) => [
    `Merge plan for ${plan.teamRunId}/${plan.workspaceId}`,
    `Requires approval: ${plan.requiresApproval ? 'yes' : 'no'}`,
    `Clean files: ${plan.cleanFiles?.length ?? plan.files.length}`,
    `Conflicts: ${plan.conflictDetails?.length ?? plan.conflicts.length}`,
    `Skipped files: ${plan.skippedFiles?.length ?? 0}`,
    `Binary files: ${plan.binaryFiles?.length ?? 0}`,
    `Renames: ${plan.renames?.length ?? 0}`,
    `Ignored files: ${plan.ignoredFiles?.length ?? 0}`,
    plan.renames?.length
      ? ['Rename details:', ...plan.renames.map((rename) => `- ${rename.oldPath} -> ${rename.newPath} (${Math.round(rename.similarity * 100)}%, ${rename.source}${rename.hasContentChanges ? ', content changed' : ''})`)].join('\n')
      : 'Rename details: none',
    plan.conflictDetails?.length
      ? ['Conflict details:', ...plan.conflictDetails.map((conflict) => `- ${conflict.path}: ${conflict.type} — ${conflict.reason}`)].join('\n')
      : 'Conflict details: none',
    plan.files.length === 0 ? 'Changed files: none' : ['Changed files:', ...plan.files.map((file) => `- ${file.status}: ${file.path}`)].join('\n'),
    plan.ignoredFiles?.length
      ? ['Ignored files:', ...plan.ignoredFiles.map((file) => `- ${file.path} (${file.source}:${file.rule})`)].join('\n')
      : undefined,
  ].filter(Boolean).join('\n')).join('\n\n');
};
