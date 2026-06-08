import type {ConnectorStatus} from './types.js';
import {getGitHubToken} from './github/auth.js';
import {detectGitHubRepo} from './github/repos.js';
import {validateConnectorEnv} from './envValidation.js';

export const listConnectorStatuses = async (cwd: string, env: Record<string, string | undefined> = process.env): Promise<ConnectorStatus[]> => {
  const repo = await detectGitHubRepo(cwd);
  const token = getGitHubToken(env);
  const githubConfigured = Boolean(repo && token);
  const linear = validateConnectorEnv('linear', env);
  const jira = validateConnectorEnv('jira', env);
  const slack = validateConnectorEnv('slack', env);

  return [{
    configured: Boolean(repo && token),
    detail: repo
      ? token
        ? `repo ${repo.owner}/${repo.name}; token configured`
        : `repo ${repo.owner}/${repo.name}; set GITHUB_TOKEN or GH_TOKEN for API access`
      : 'no GitHub remote detected',
    name: 'github',
    permissions: githubConfigured ? ['GitHubRead', 'GitHubComment', 'GitHubWrite'] : [],
  }, {
    configured: linear.configured,
    detail: linear.configured ? 'LINEAR_API_KEY configured' : `Missing: ${linear.missing.join(', ')}`,
    name: 'linear',
    permissions: linear.configured ? ['LinearRead', 'LinearWrite'] : [],
  }, {
    configured: jira.configured,
    detail: jira.configured ? 'JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN configured' : `Missing: ${jira.missing.join(', ')}`,
    name: 'jira',
    permissions: jira.configured ? ['JiraRead', 'JiraWrite'] : [],
  }, {
    configured: slack.configured,
    detail: slack.configured ? 'SLACK_BOT_TOKEN configured' : `Missing: ${slack.missing.join(', ')}`,
    name: 'slack',
    permissions: slack.configured ? ['SlackRead', 'SlackWrite'] : [],
  }];
};
