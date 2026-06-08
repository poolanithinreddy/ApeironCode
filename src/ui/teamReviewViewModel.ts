import type {TeamRunRecord} from '../agents/artifacts/types.js';
import type {MergePlan, SubagentWorkspace} from '../agents/workspace/types.js';

export interface TeamReviewViewModel {
  actionHints: string[];
  artifactLine: string;
  conflictLine: string;
  empty: boolean;
  mergeLine: string;
  statusLine: string;
  title: string;
  workspaceLines: string[];
}

export const buildTeamReviewViewModel = (input: {
  mergePlans?: MergePlan[];
  run: TeamRunRecord | null;
  workspaces?: SubagentWorkspace[];
}): TeamReviewViewModel => {
  if (!input.run) {
    return {
      actionHints: ['Run `apeironcode team runs` to list known team runs.'],
      artifactLine: 'Artifacts: none',
      conflictLine: 'Conflicts: unknown',
      empty: true,
      mergeLine: 'Merge: no run selected',
      statusLine: 'Missing team run',
      title: 'Team Review',
      workspaceLines: [],
    };
  }
  const conflicts = input.mergePlans?.reduce((count, plan) => count + (plan.conflictDetails?.length ?? 0), 0) ?? 0;
  const files = input.mergePlans?.reduce((count, plan) => count + plan.files.length, 0) ?? 0;
  return {
    actionHints: [
      `apeironcode team artifacts ${input.run.teamRunId}`,
      `apeironcode team conflicts ${input.run.teamRunId}`,
      `apeironcode team apply ${input.run.teamRunId}`,
      `apeironcode team discard ${input.run.teamRunId}`,
      `apeironcode team export ${input.run.teamRunId}`,
    ],
    artifactLine: `Artifacts: ${input.run.artifacts.length}`,
    conflictLine: `Conflicts: ${conflicts}`,
    empty: false,
    mergeLine: `Changed files: ${files}`,
    statusLine: `Status: ${input.run.ok ? 'ok' : 'partial'} | Goal: ${input.run.goal || 'unknown'}`,
    title: `Team Review: ${input.run.teamRunId}`,
    workspaceLines: (input.workspaces ?? []).map((workspace) => `${workspace.agentName}: ${workspace.mode}/${workspace.status}`),
  };
};

export const formatTeamReview = (view: TeamReviewViewModel): string => [
  view.title,
  view.statusLine,
  view.artifactLine,
  view.mergeLine,
  view.conflictLine,
  view.workspaceLines.length > 0 ? ['Workspaces:', ...view.workspaceLines.map((line) => `- ${line}`)].join('\n') : 'Workspaces: none recorded',
  '',
  'Actions:',
  ...view.actionHints.map((hint) => `- ${hint}`),
].join('\n');
