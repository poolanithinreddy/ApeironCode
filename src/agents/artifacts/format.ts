import type {TeamArtifact, TeamRunRecord} from './types.js';

export const formatTeamRuns = (runs: TeamRunRecord[]): string =>
  runs.length === 0
    ? 'No team runs recorded.'
    : runs.map((run) => `${run.teamRunId} | ${run.ok ? 'ok' : 'partial'} | artifacts=${run.artifacts.length} | ${run.goal || 'team run'}`).join('\n');

export const formatTeamRunRecord = (run: TeamRunRecord | null): string => {
  if (!run) {
    return 'Team run not found.';
  }
  return [
    `Team run: ${run.teamRunId}`,
    `Goal: ${run.goal || 'unknown'}`,
    `Status: ${run.ok ? 'ok' : 'partial'}`,
    `Created: ${run.createdAt}`,
    '',
    formatTeamArtifacts(run.artifacts),
  ].join('\n');
};

export const formatTeamArtifacts = (artifacts: TeamArtifact[]): string =>
  artifacts.length === 0
    ? 'No artifacts recorded.'
    : ['Artifacts:', ...artifacts.map((artifact) => `- ${artifact.id} | ${artifact.kind} | ${artifact.title}`)].join('\n');
