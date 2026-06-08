import {TeamArtifactStore} from './store.js';
import {formatTeamArtifacts, formatTeamRunRecord, formatTeamRuns} from './format.js';

export const browseTeamRuns = async (cwd: string): Promise<string> =>
  formatTeamRuns(await new TeamArtifactStore(cwd).listRuns());

export const showTeamRun = async (cwd: string, teamRunId: string): Promise<string> =>
  formatTeamRunRecord(await new TeamArtifactStore(cwd).getRun(teamRunId));

export const showTeamArtifact = async (cwd: string, teamRunId: string, artifactId: string): Promise<string> => {
  const result = await new TeamArtifactStore(cwd).readArtifact(teamRunId, artifactId);
  return result ? result.content : 'Team artifact not found.';
};

export const listTeamArtifacts = async (cwd: string, teamRunId: string): Promise<string> => {
  const run = await new TeamArtifactStore(cwd).getRun(teamRunId);
  return run ? formatTeamArtifacts(run.artifacts) : 'Team run not found.';
};
