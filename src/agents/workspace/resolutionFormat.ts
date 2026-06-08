import type {MergePlan} from './types.js';
import type {MergeResolutionState} from './resolution.js';

export const formatMergeResolution = (
  teamRunId: string,
  plans: MergePlan[],
  state: MergeResolutionState,
): string => {
  const conflicts = plans.flatMap((plan) => plan.conflictDetails ?? []);
  const cleanFiles = plans.flatMap((plan) => plan.cleanFiles ?? []);
  return [
    `Merge resolution workflow: ${teamRunId}`,
    `Clean files: ${cleanFiles.length}`,
    `Conflicts: ${conflicts.length}`,
    `Recorded resolutions: ${state.entries.length}`,
    '',
    cleanFiles.length === 0
      ? 'Clean apply candidates: none'
      : ['Clean apply candidates:', ...cleanFiles.map((file) => `- ${file.rename ? `${file.rename.oldPath} -> ${file.rename.newPath}` : file.path}`)].join('\n'),
    '',
    conflicts.length === 0
      ? 'Conflicts: none'
      : ['Conflicts:', ...conflicts.map((conflict) => `- ${conflict.path}: ${conflict.type} — ${conflict.reason}`)].join('\n'),
    '',
    state.entries.length === 0
      ? 'Resolution state: none'
      : ['Resolution state:', ...state.entries.map((entry) => `- ${entry.file}: ${entry.action}`)].join('\n'),
    '',
    `Hints: apeironcode team resolve ${teamRunId} --file <path> --action skip|manual|apply`,
    `Patch export: apeironcode team export-patch ${teamRunId}`,
  ].join('\n');
};
