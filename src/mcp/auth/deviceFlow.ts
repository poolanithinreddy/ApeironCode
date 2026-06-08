import {McpProtocolError} from '../protocol.js';
import type {McpAuthToken, McpDeviceAuthorization, McpOAuthClientConfig} from './types.js';

export interface DeviceFlowOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export const startMcpDeviceFlow = async (
  config: McpOAuthClientConfig,
  options: DeviceFlowOptions = {},
): Promise<McpDeviceAuthorization> => {
  if (!config.deviceAuthorizationEndpoint) {
    throw new McpProtocolError('MCP OAuth device flow is not configured for this server.', -32010);
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(config.deviceAuthorizationEndpoint, {
    body: new URLSearchParams({
      client_id: config.clientId,
      scope: config.scopes?.join(' ') ?? '',
    }),
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    method: 'POST',
  });
  const body = await response.json() as {
    device_code?: string;
    expires_in?: number;
    interval?: number;
    user_code?: string;
    verification_uri?: string;
    verification_uri_complete?: string;
  };
  if (!response.ok || !body.device_code || !body.user_code || !body.verification_uri) {
    throw new McpProtocolError(`MCP OAuth device authorization failed: ${response.status} ${response.statusText}`, response.status);
  }
  return {
    deviceCode: body.device_code,
    expiresIn: body.expires_in ?? 600,
    interval: body.interval,
    userCode: body.user_code,
    verificationUri: body.verification_uri_complete ?? body.verification_uri,
  };
};

export const pollMcpDeviceToken = async (
  config: McpOAuthClientConfig,
  deviceCode: string,
  options: DeviceFlowOptions = {},
): Promise<McpAuthToken> => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(config.tokenEndpoint, {
    body: new URLSearchParams({
      client_id: config.clientId,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    method: 'POST',
  });
  const body = await response.json() as {
    access_token?: string;
    error?: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
  };
  if (!response.ok || !body.access_token) {
    throw new McpProtocolError(`MCP OAuth device token pending or failed: ${body.error ?? response.statusText}`, response.status);
  }
  return {
    accessToken: body.access_token,
    expiresAt: body.expires_in ? (options.now?.() ?? Date.now()) + body.expires_in * 1000 : undefined,
    refreshToken: body.refresh_token,
    scope: body.scope,
    tokenType: 'Bearer',
  };
};
