import type {TeamArtifact} from '../agents/artifacts/types.js';
import {redactSecrets} from '../share/redactor.js';

export interface ArtifactGroupViewModel {
  artifacts: Array<{
    id: string;
    line: string;
  }>;
  kind: string;
}

export interface ArtifactBrowserViewModel {
  detailLines: string[];
  empty: boolean;
  filterLine: string;
  groups: ArtifactGroupViewModel[];
  redactionLine: string;
  title: string;
}

const truncate = (value: string, max = 1600): string =>
  value.length > max ? `${value.slice(0, max)}\n[truncated ${value.length - max} chars]` : value;

export const buildArtifactBrowserViewModel = (
  artifacts: TeamArtifact[],
  selected?: {artifactId: string; content: string} | null,
  filters?: {filter?: string; search?: string},
): ArtifactBrowserViewModel => {
  const filtered = artifacts.filter((artifact) =>
    (!filters?.filter || artifact.kind === filters.filter)
    && (!filters?.search || `${artifact.id} ${artifact.kind} ${artifact.title}`.toLowerCase().includes(filters.search.toLowerCase())));
  const groups = new Map<string, TeamArtifact[]>();
  for (const artifact of filtered) {
    groups.set(artifact.kind, [...(groups.get(artifact.kind) ?? []), artifact]);
  }
  const redactedContent = selected ? redactSecrets(selected.content) : '';
  return {
    detailLines: selected
      ? [
          `Selected: ${selected.artifactId}`,
          `Size: ${selected.content.length} chars`,
          ...truncate(redactedContent).split('\n'),
        ]
      : ['Select with: /team artifact <teamRunId> <artifactId>'],
    empty: filtered.length === 0,
    filterLine: `Filter: ${filters?.filter ?? 'all'} | Search: ${filters?.search ?? 'none'}`,
    groups: Array.from(groups.entries()).map(([kind, entries]) => ({
      artifacts: entries.map((artifact) => ({
        id: artifact.id,
        line: `${artifact.id} | ${artifact.title} | created=${artifact.createdAt}`,
      })),
      kind,
    })),
    redactionLine: selected && redactedContent !== selected.content ? 'Redaction: applied' : 'Redaction: not needed',
    title: `Artifacts (${filtered.length}/${artifacts.length})`,
  };
};

export const formatArtifactBrowser = (
  artifacts: TeamArtifact[],
  teamRunId: string,
  selected?: {artifactId: string; content: string} | null,
  filters?: {filter?: string; search?: string},
): string => {
  const view = buildArtifactBrowserViewModel(artifacts, selected, filters);
  if (view.empty) {
    return `No artifacts matched.\n${view.filterLine}`;
  }
  return [
    view.title,
    view.filterLine,
    view.redactionLine,
    '',
    ...view.groups.map((group) => [
      `## ${group.kind}`,
      ...group.artifacts.map((artifact) => `- ${artifact.line}`),
    ].join('\n')),
    '',
    ...view.detailLines,
    '',
    `Hints: apeironcode team artifact ${teamRunId} <artifactId> --preview | apeironcode team artifacts ${teamRunId} --filter diff | apeironcode team export ${teamRunId}`,
  ].join('\n');
};
