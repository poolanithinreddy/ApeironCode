import type {LinearIssue, LinearProject} from './types.js';

export const formatLinearIssue = (issue: LinearIssue): string => {
  const lines = [
    `${issue.identifier} ${issue.title}`,
    `State: ${issue.state?.name ?? 'unknown'}`,
    issue.team ? `Team: ${issue.team.name}${issue.team.key ? ` (${issue.team.key})` : ''}` : null,
    issue.assignee ? `Assignee: ${issue.assignee.displayName ?? issue.assignee.name}` : 'Assignee: unassigned',
    issue.priority !== undefined ? `Priority: ${issue.priority}` : null,
    issue.url ? `URL: ${issue.url}` : null,
    '',
    issue.description?.trim() || 'No description.',
  ];
  return lines.filter((line): line is string => line !== null).join('\n');
};

export const formatLinearIssueList = (issues: LinearIssue[]): string => {
  if (issues.length === 0) {
    return 'No Linear issues found.';
  }
  return issues
    .map((issue) =>
      `${issue.identifier} ${issue.title} | ${issue.state?.name ?? '?'} | ${issue.team?.key ?? issue.team?.name ?? '-'}`,
    )
    .join('\n');
};

export const formatLinearProject = (project: LinearProject): string => {
  const lines = [
    `${project.name}${project.slugId ? ` [${project.slugId}]` : ''}`,
    project.state ? `State: ${project.state}` : null,
    project.url ? `URL: ${project.url}` : null,
    '',
    project.description?.trim() || 'No description.',
  ];
  return lines.filter((line): line is string => line !== null).join('\n');
};

export const formatLinearProjectList = (projects: LinearProject[]): string => {
  if (projects.length === 0) {
    return 'No Linear projects found.';
  }
  return projects
    .map((project) => `${project.name} | ${project.state ?? '-'} | ${project.slugId ?? project.id}`)
    .join('\n');
};
