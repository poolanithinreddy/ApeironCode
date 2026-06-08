import {getGitHubToken} from './auth.js';
import type {GitHubRepoRef} from './repos.js';

export interface GitHubClientOptions {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  repo: GitHubRepoRef;
}

type GitHubRequestInit = {
  body?: string;
  headers?: Record<string, string>;
  method?: string;
};

export class GitHubClient {
  private readonly fetchImpl: typeof fetch;
  private readonly token: string | null;

  constructor(private readonly options: GitHubClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.token = getGitHubToken(options.env);
  }

  get configured(): boolean {
    return Boolean(this.token);
  }

  async request<T>(path: string, init: GitHubRequestInit = {}): Promise<T> {
    if (!this.token) {
      throw new Error('GITHUB_TOKEN is not set.');
    }

    const response = await this.fetchImpl(`https://api.github.com/repos/${this.options.repo.owner}/${this.options.repo.name}${path}`, {
      ...init,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${this.token}`,
        'user-agent': 'ApeironCode-Agent',
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      const body = await safeText(response);
      const reset = response.headers.get('x-ratelimit-reset');
      const rateDetail = response.status === 403 && reset
        ? ` Rate limit may reset at ${new Date(Number.parseInt(reset, 10) * 1000).toISOString()}.`
        : '';
      const detail = body ? ` ${redactGitHubSecrets(body, this.token).slice(0, 300)}` : '';
      throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}.${rateDetail}${detail}`);
    }
    return response.json() as Promise<T>;
  }

  async requestText(path: string, init: GitHubRequestInit = {}): Promise<string> {
    if (!this.token) {
      throw new Error('GITHUB_TOKEN is not set.');
    }
    const response = await this.fetchImpl(`https://api.github.com/repos/${this.options.repo.owner}/${this.options.repo.name}${path}`, {
      ...init,
      headers: {
        accept: 'text/plain',
        authorization: `Bearer ${this.token}`,
        'user-agent': 'ApeironCode-Agent',
        ...(init.headers ?? {}),
      },
    });
    const text = await safeText(response);
    if (!response.ok) {
      throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}. ${redactGitHubSecrets(text, this.token).slice(0, 300)}`);
    }
    return redactGitHubSecrets(text, this.token);
  }
}

const safeText = async (response: Response): Promise<string> => {
  try {
    return await response.text();
  } catch {
    return '';
  }
};

export const redactGitHubSecrets = (text: string, token?: string | null): string => {
  let output = text.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gu, 'Bearer [REDACTED]');
  output = output.replace(/"authorization"\s*:\s*"[^"]+"/giu, '"authorization":"[REDACTED]"');
  if (token && token.length >= 4) {
    output = output.split(token).join('[REDACTED]');
  }
  return output;
};
