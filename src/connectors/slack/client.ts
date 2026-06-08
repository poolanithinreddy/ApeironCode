import {getSlackBotToken} from './auth.js';

const SLACK_API_BASE = 'https://slack.com/api';

export interface SlackClientOptions {
  baseUrl?: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}

interface SlackRequestInit {
  body?: Record<string, unknown>;
  method?: 'GET' | 'POST';
  query?: Record<string, string | number | boolean | undefined>;
}

interface SlackApiResponse {
  error?: string;
  ok: boolean;
  warning?: string;
}

const redactToken = (text: string, token: string | null): string => {
  if (!token || token.length < 4) {
    return text;
  }
  return text.split(token).join('[REDACTED]');
};

export class SlackError extends Error {
  constructor(message: string, readonly slackError?: string) {
    super(message);
    this.name = 'SlackError';
  }
}

export class SlackClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly token: string | null;

  constructor(options: SlackClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? SLACK_API_BASE;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.token = getSlackBotToken(options.env);
  }

  get configured(): boolean {
    return Boolean(this.token);
  }

  async call<T extends SlackApiResponse>(method: string, init: SlackRequestInit = {}): Promise<T> {
    if (!this.token) {
      throw new SlackError('SLACK_BOT_TOKEN is not set.');
    }

    const url = new URL(`${this.baseUrl}/${method}`);
    if (init.method !== 'POST' && init.query) {
      for (const [key, value] of Object.entries(init.query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      authorization: `Bearer ${this.token}`,
    };
    let body: string | undefined;
    if (init.method === 'POST') {
      headers['content-type'] = 'application/json; charset=utf-8';
      body = JSON.stringify(init.body ?? {});
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        body,
        headers,
        method: init.method ?? 'GET',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new SlackError(`Slack network request failed: ${redactToken(message, this.token)}`);
    }

    if (!response.ok) {
      throw new SlackError(`Slack HTTP request failed: ${response.status} ${response.statusText}`);
    }

    const json = await response.json() as T;
    if (!json.ok) {
      throw new SlackError(`Slack API error: ${json.error ?? 'unknown_error'}`, json.error);
    }
    return json;
  }
}
