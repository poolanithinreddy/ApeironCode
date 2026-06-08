import type {MergePlan} from './types.js';

export const formatConflictReport = (plans: MergePlan[]): string => {
  const conflicts = plans.flatMap((plan) => plan.conflictDetails ?? []);
  if (conflicts.length === 0) {
    return 'No team workspace conflicts detected.';
  }
  return [
    `Team workspace conflicts: ${conflicts.length}`,
    '',
    ...plans.flatMap((plan) => {
      const planConflicts = plan.conflictDetails ?? [];
      if (planConflicts.length === 0) {
        return [];
      }
      return [
        `Workspace: ${plan.workspaceId}`,
        ...planConflicts.map((conflict) => [
          `- ${conflict.path}`,
          `  type: ${conflict.type}`,
          `  reason: ${conflict.reason}`,
          '  risk: high',
          '  main: changed/current workspace state requires review',
          '  isolated: subagent workspace has a competing result',
          '  base: stored at workspace creation',
          '  recommended action: inspect manually, apply a clean file, or discard the workspace',
          `  apply file: apeironcode team apply ${plan.teamRunId} --file ${conflict.path}`,
          `  discard: apeironcode team discard ${plan.teamRunId}`,
          `  next: apeironcode team merge-plan ${plan.teamRunId}`,
        ].join('\n')),
        '',
      ];
    }),
  ].join('\n').trim();
};
