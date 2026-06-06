import {McpProtocolError} from '../protocol.js';
import type {McpAuthToken, McpOAuthClientConfig} from './types.js';

export interface OAuthFetchOptions {
  fetchImpl?: typeof fetch;
}

const parseTokenResponse = async (response: Response): Promise<McpAuthToken> => {
  const body = await response.json() as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
    token_type?: string;
  };
  if (!response.ok || !body.access_token) {
    throw new McpProtocolError(`MCP OAuth token request failed: ${response.status} ${response.statusText}`, response.status);
  }
  return {
    accessToken: body.access_token,
    expiresAt: body.expires_in ? Date.now() + body.expires_in * 1000 : undefined,
    refreshToken: body.refresh_token,
    scope: body.scope,
    tokenType: 'Bearer',
  };
};

export const refreshMcpOAuthToken = async (
  config: McpOAuthClientConfig,
  refreshToken: string,
  options: OAuthFetchOptions = {},
): Promise<McpAuthToken> => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    client_id: config.clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const response = await fetchImpl(config.tokenEndpoint, {
    body,
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    method: 'POST',
  });
  const token = await parseTokenResponse(response);
  return {...token, refreshToken: token.refreshToken ?? refreshToken};
};

export const buildBearerHeaders = (token: McpAuthToken | null): Record<string, string> =>
  token ? {authorization: `${token.tokenType} ${token.accessToken}`} : {};
