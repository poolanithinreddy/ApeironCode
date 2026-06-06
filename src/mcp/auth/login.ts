import {pollMcpDeviceToken, startMcpDeviceFlow} from './deviceFlow.js';
import {discoverMcpOAuthMetadata} from './metadata.js';
import {refreshMcpOAuthToken} from './oauth.js';
import {FileMcpTokenStore, getMcpAuthStatus} from './tokenStore.js';
import type {McpAuthToken, McpDeviceAuthorization, McpOAuthClientConfig, McpTokenStore} from './types.js';

export interface EnsureMcpAuthTokenOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  oauthConfig?: McpOAuthClientConfig;
  resourceUrl?: string;
  serverId: string;
  store?: McpTokenStore;
}

export interface DeviceLoginOptions extends EnsureMcpAuthTokenOptions {
  oauthConfig?: McpOAuthClientConfig;
  onUserPrompt?: (info: McpDeviceAuthorization) => void;
  pollAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const resolveOauthConfig = async (
  options: EnsureMcpAuthTokenOptions,
): Promise<McpOAuthClientConfig> => {
  if (options.oauthConfig) return options.oauthConfig;
  if (!options.resourceUrl) {
    throw new Error('MCP OAuth requires either oauthConfig or resourceUrl for metadata discovery.');
  }
  return discoverMcpOAuthMetadata({
    clientId: 'apeironcode-agent',
    fetchImpl: options.fetchImpl,
    resourceUrl: options.resourceUrl,
  });
};

export const ensureMcpAuthToken = async (
  options: EnsureMcpAuthTokenOptions,
): Promise<{status: 'authenticated' | 'expired' | 'missing'; token: McpAuthToken | null}> => {
  const store = options.store ?? new FileMcpTokenStore();
  const token = await store.get(options.serverId);
  const status = getMcpAuthStatus(token, options.now?.() ?? Date.now());

  if (status === 'refresh_available' && token?.refreshToken) {
    const oauthConfig = await resolveOauthConfig(options);
    try {
      const refreshed = await refreshMcpOAuthToken(oauthConfig, token.refreshToken, {fetchImpl: options.fetchImpl});
      await store.set(options.serverId, refreshed);
      return {status: 'authenticated', token: refreshed};
    } catch {
      await store.clear(options.serverId);
      return {status: 'expired', token: null};
    }
  }
  if (status === 'authenticated') {
    return {status: 'authenticated', token};
  }
  if (status === 'expired') {
    return {status: 'expired', token};
  }
  return {status: 'missing', token: null};
};

export const runMcpDeviceLogin = async (
  options: DeviceLoginOptions,
): Promise<McpAuthToken> => {
  const store = options.store ?? new FileMcpTokenStore();
  const oauthConfig = await resolveOauthConfig(options);
  const authorization = await startMcpDeviceFlow(oauthConfig, {fetchImpl: options.fetchImpl});
  options.onUserPrompt?.(authorization);

  const interval = (authorization.interval ?? 5) * 1_000;
  const max = options.pollAttempts ?? 60;
  const sleepFn = options.sleep ?? sleep;
  let lastError: unknown;
  for (let attempt = 1; attempt <= max; attempt += 1) {
    try {
      const token = await pollMcpDeviceToken(oauthConfig, authorization.deviceCode, {fetchImpl: options.fetchImpl, now: options.now});
      await store.set(options.serverId, token);
      return token;
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      if (!/authorization_pending|slow_down/iu.test(message)) {
        throw err;
      }
      await sleepFn(interval);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('MCP device authorization timed out.');
};
