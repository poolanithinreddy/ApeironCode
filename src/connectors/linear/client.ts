import {getLinearApiKey} from './auth.js';

const LINEAR_GRAPHQL_ENDPOINT = 'https://api.linear.app/graphql';

export interface LinearClientOptions {
  endpoint?: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}

interface LinearGraphQLError {
  extensions?: Record<string, unknown>;
  message: string;
  path?: Array<string | number>;
}

interface LinearGraphQLResponse<T> {
  data?: T;
  errors?: LinearGraphQLError[];
}

const redactToken = (text: string, token: string | null): string => {
  if (!token || token.length < 4) {
    return text;
  }
  return text.split(token).join('[REDACTED]');
};

export class LinearError extends Error {
  constructor(message: string, readonly graphqlErrors?: LinearGraphQLError[]) {
    super(message);
    this.name = 'LinearError';
  }
}

export class LinearClient {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly token: string | null;

  constructor(options: LinearClientOptions = {}) {
    this.endpoint = options.endpoint ?? LINEAR_GRAPHQL_ENDPOINT;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.token = getLinearApiKey(options.env);
  }

  get configured(): boolean {
    return Boolean(this.token);
  }

  async request<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    if (!this.token) {
      throw new LinearError('LINEAR_API_KEY is not set.');
    }

    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        body: JSON.stringify({query, variables}),
        headers: {
          'authorization': this.token,
          'content-type': 'application/json',
        },
        method: 'POST',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new LinearError(`Linear network request failed: ${redactToken(message, this.token)}`);
    }

    if (!response.ok) {
      throw new LinearError(`Linear request failed: ${response.status} ${response.statusText}`);
    }

    const json = await response.json() as LinearGraphQLResponse<T>;

    if (json.errors && json.errors.length > 0) {
      const messages = json.errors.map((e) => redactToken(e.message, this.token)).join('; ');
      throw new LinearError(`Linear GraphQL error: ${messages}`, json.errors);
    }

    if (!json.data) {
      throw new LinearError('Linear GraphQL response had no data.');
    }

    return json.data;
  }
}
