import type {JiraIssue, JiraProject} from './types.js';

export const formatJiraIssue = (issue: JiraIssue): string => {
  const lines = [
    `${issue.key} ${issue.summary}`,
    `Status: ${issue.status?.name ?? 'unknown'}`,
    issue.issueType ? `Type: ${issue.issueType.name}` : null,
    issue.priority ? `Priority: ${issue.priority.name}` : null,
    issue.project ? `Project: ${issue.project.name} (${issue.project.key})` : null,
    issue.assignee ? `Assignee: ${issue.assignee.displayName ?? issue.assignee.accountId ?? 'unknown'}` : 'Assignee: unassigned',
    issue.url ? `URL: ${issue.url}` : null,
    '',
    issue.description?.trim() || 'No description.',
  ];
  return lines.filter((line): line is string => line !== null).join('\n');
};

export const formatJiraIssueList = (issues: JiraIssue[]): string => {
  if (issues.length === 0) {
    return 'No Jira issues found.';
  }
  return issues
    .map((issue) =>
      `${issue.key} ${issue.summary} | ${issue.status?.name ?? '?'} | ${issue.issueType?.name ?? '-'}`,
    )
    .join('\n');
};

export const formatJiraProject = (project: JiraProject): string => [
  `${project.key} ${project.name}`,
  project.projectTypeKey ? `Type: ${project.projectTypeKey}` : null,
  project.url ? `URL: ${project.url}` : null,
].filter((line): line is string => line !== null).join('\n');

export const formatJiraProjectList = (projects: JiraProject[]): string => {
  if (projects.length === 0) {
    return 'No Jira projects found.';
  }
  return projects
    .map((project) => `${project.key} ${project.name} | ${project.projectTypeKey ?? '-'}`)
    .join('\n');
};
