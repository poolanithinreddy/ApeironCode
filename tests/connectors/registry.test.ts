import {describe, expect, it} from 'vitest';

import {listConnectorStatuses} from '../../src/connectors/registry.js';

describe('connector registry', () => {
  it('lists GitHub, Linear, Jira, and Slack without secret values', async () => {
    const statuses = await listConnectorStatuses(process.cwd(), {
      GH_TOKEN: 'github-secret',
      JIRA_API_TOKEN: 'jira-secret',
      JIRA_EMAIL: 'user@example.com',
      JIRA_HOST: 'example.atlassian.net',
      LINEAR_API_KEY: 'linear-secret',
      SLACK_BOT_TOKEN: 'slack-secret',
    });

    expect(statuses.map((status) => status.name)).toEqual(['github', 'linear', 'jira', 'slack']);
    expect(statuses.find((status) => status.name === 'linear')?.permissions).toContain('LinearWrite');
    expect(statuses.find((status) => status.name === 'jira')?.permissions).toContain('JiraRead');
    expect(statuses.find((status) => status.name === 'slack')?.permissions).toContain('SlackWrite');
    expect(JSON.stringify(statuses)).not.toContain('secret');
    expect(JSON.stringify(statuses)).not.toContain('user@example.com');
  });
});
