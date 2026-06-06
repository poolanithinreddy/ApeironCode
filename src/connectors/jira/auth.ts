export interface JiraCredentials {
  apiToken: string;
  baseUrl: string;
  email: string;
}

export const normalizeJiraBaseUrl = (host: string): string => {
  const trimmed = host.trim();
  if (!trimmed) {
    return '';
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme.replace(/\/+$/, '');
};

export const getJiraCredentials = (
  env: Record<string, string | undefined> = process.env,
): JiraCredentials | null => {
  const host = env.JIRA_HOST?.trim();
  const email = env.JIRA_EMAIL?.trim();
  const apiToken = env.JIRA_API_TOKEN?.trim();
  if (!host || !email || !apiToken) {
    return null;
  }
  const baseUrl = normalizeJiraBaseUrl(host);
  if (!baseUrl) {
    return null;
  }
  return {apiToken, baseUrl, email};
};

export const buildJiraBasicAuthHeader = (credentials: JiraCredentials): string => {
  const raw = `${credentials.email}:${credentials.apiToken}`;
  const encoded = Buffer.from(raw, 'utf-8').toString('base64');
  return `Basic ${encoded}`;
};

export const formatJiraSetupHint = (): string =>
  'Jira connector is opt-in. Set JIRA_HOST (e.g. yourorg.atlassian.net), JIRA_EMAIL, and JIRA_API_TOKEN. Credentials are read from env only and never printed.';
