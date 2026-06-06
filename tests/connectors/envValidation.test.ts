import {describe, expect, it} from 'vitest';

import {listConnectorEnvRequirements, validateConnectorEnv} from '../../src/connectors/envValidation.js';

describe('connector env validation', () => {
  it('supports GitHub token alternatives without exposing values', () => {
    const validation = validateConnectorEnv('github', {GH_TOKEN: 'gh-secret-token'});

    expect(validation.configured).toBe(true);
    expect(validation.requirements[0]?.alternatives).toContain('GH_TOKEN');
    expect(JSON.stringify(validation)).not.toContain('gh-secret-token');
  });

  it('reports Linear, Jira, and Slack missing requirements by name only', () => {
    expect(validateConnectorEnv('linear', {}).missing).toEqual(['LINEAR_API_KEY']);
    expect(validateConnectorEnv('jira', {JIRA_HOST: 'example.atlassian.net'}).missing)
      .toEqual(['JIRA_EMAIL', 'JIRA_API_TOKEN']);
    expect(validateConnectorEnv('slack', {}).missing).toEqual(['SLACK_BOT_TOKEN']);
  });

  it('lists setup hints and configured statuses without env values', () => {
    const env = {
      JIRA_API_TOKEN: 'jira-secret',
      JIRA_EMAIL: 'user@example.com',
      JIRA_HOST: 'example.atlassian.net',
    };
    const requirements = listConnectorEnvRequirements('jira', env);
    const validation = validateConnectorEnv('jira', env);

    expect(requirements.every((requirement) => requirement.configured)).toBe(true);
    expect(validation.setupHint).toContain('JIRA_HOST');
    expect(JSON.stringify(validation)).not.toContain('jira-secret');
    expect(JSON.stringify(validation)).not.toContain('user@example.com');
  });
});
