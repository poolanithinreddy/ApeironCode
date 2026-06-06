import {buildJiraBasicAuthHeader, getJiraCredentials, type JiraCredentials} from './auth.js';

export interface JiraClientOptions {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}

interface JiraRequestInit {
  body?: string;
  headers?: Record<string, string>;
  method?: string;
  query?: Record<string, string | number | undefined>;
}

const redactSecrets = (text: string, credentials: JiraCredentials | null): string => {
  if (!credentials) {
    return text;
  }
  let out = text;
  if (credentials.apiToken && credentials.apiToken.length >= 4) {
    out = out.split(credentials.apiToken).join('[REDACTED]');
  }
  const header = buildJiraBasicAuthHeader(credentials);
  out = out.split(header).join('[REDACTED]');
  out = out.split(header.replace(/^Basic\s+/i, '')).join('[REDACTED]');
  return out;
};

export class JiraError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'JiraError';
  }
}

export class JiraClient {
  private readonly credentials: JiraCredentials | null;
  private readonly fetchImpl: typeof fetch;

  constructor(options: JiraClientOptions = {}) {
    this.credentials = getJiraCredentials(options.env);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get configured(): boolean {
    return this.credentials !== null;
  }

  get baseUrl(): string {
    return this.credentials?.baseUrl ?? '';
  }

  async request<T>(path: string, init: JiraRequestInit = {}): Promise<T> {
    if (!this.credentials) {
      throw new JiraError('Jira credentials are not set. Provide JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN.');
    }

    const url = new URL(`${this.credentials.baseUrl}${path}`);
    if (init.query) {
      for (const [key, value] of Object.entries(init.query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        body: init.body,
        headers: {
          'accept': 'application/json',
          'authorization': buildJiraBasicAuthHeader(this.credentials),
          'content-type': 'application/json',
          ...(init.headers ?? {}),
        },
        method: init.method ?? 'GET',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new JiraError(`Jira network request failed: ${redactSecrets(message, this.credentials)}`);
    }

    if (!response.ok) {
      let detail = '';
      try {
        const text = await response.text();
        detail = redactSecrets(text, this.credentials).slice(0, 500);
      } catch {
        // ignore body read errors
      }
      throw new JiraError(
        `Jira API request failed: ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ''}`,
        response.status,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }
}
