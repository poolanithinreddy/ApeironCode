import {formatGitHubSetupHint} from './github/auth.js';
import {formatJiraSetupHint} from './jira/auth.js';
import {formatLinearSetupHint} from './linear/auth.js';
import {formatSlackSetupHint} from './slack/auth.js';

export type ConnectorId = 'github' | 'jira' | 'linear' | 'slack';

export interface ConnectorEnvRequirement {
  alternatives?: string[];
  configured: boolean;
  name: string;
  required: boolean;
}

export interface ConnectorEnvValidation {
  connectorId: ConnectorId;
  configured: boolean;
  missing: string[];
  requirements: ConnectorEnvRequirement[];
  setupHint: string;
}

const hasValue = (env: Record<string, string | undefined>, name: string): boolean =>
  Boolean(env[name]?.trim());

export const listConnectorEnvRequirements = (
  connectorId: ConnectorId,
  env: Record<string, string | undefined> = process.env,
): ConnectorEnvRequirement[] => {
  switch (connectorId) {
    case 'github': {
      const configured = hasValue(env, 'GITHUB_TOKEN') || hasValue(env, 'GH_TOKEN');
      return [{alternatives: ['GH_TOKEN'], configured, name: 'GITHUB_TOKEN', required: true}];
    }
    case 'linear':
      return [{configured: hasValue(env, 'LINEAR_API_KEY'), name: 'LINEAR_API_KEY', required: true}];
    case 'jira':
      return [
        {configured: hasValue(env, 'JIRA_HOST'), name: 'JIRA_HOST', required: true},
        {configured: hasValue(env, 'JIRA_EMAIL'), name: 'JIRA_EMAIL', required: true},
        {configured: hasValue(env, 'JIRA_API_TOKEN'), name: 'JIRA_API_TOKEN', required: true},
      ];
    case 'slack':
      return [{configured: hasValue(env, 'SLACK_BOT_TOKEN'), name: 'SLACK_BOT_TOKEN', required: true}];
  }
};

const setupHintFor = (connectorId: ConnectorId): string => {
  switch (connectorId) {
    case 'github':
      return formatGitHubSetupHint();
    case 'linear':
      return formatLinearSetupHint();
    case 'jira':
      return formatJiraSetupHint();
    case 'slack':
      return formatSlackSetupHint();
  }
};

export const validateConnectorEnv = (
  connectorId: ConnectorId,
  env: Record<string, string | undefined> = process.env,
): ConnectorEnvValidation => {
  const requirements = listConnectorEnvRequirements(connectorId, env);
  const missing = requirements
    .filter((requirement) => requirement.required && !requirement.configured)
    .map((requirement) =>
      requirement.alternatives?.length
        ? `${requirement.name} or ${requirement.alternatives.join(' or ')}`
        : requirement.name,
    );

  return {
    connectorId,
    configured: missing.length === 0,
    missing,
    requirements,
    setupHint: setupHintFor(connectorId),
  };
};
