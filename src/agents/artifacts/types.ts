export type TeamArtifactKind =
  | 'conflict-report'
  | 'diff'
  | 'merge-plan'
  | 'plan'
  | 'subagent-output'
  | 'summary';

export interface TeamArtifact {
  createdAt: string;
  id: string;
  kind: TeamArtifactKind;
  path: string;
  title: string;
}

export interface TeamRunRecord {
  artifacts: TeamArtifact[];
  createdAt: string;
  goal: string;
  ok: boolean;
  teamRunId: string;
}
