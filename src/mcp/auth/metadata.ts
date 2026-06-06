import {McpProtocolError} from '../protocol.js';
import type {McpOAuthClientConfig} from './types.js';

interface RawAuthorizationServerMetadata {
  authorization_endpoint?: string;
  device_authorization_endpoint?: string;
  scopes_supported?: string[];
  token_endpoint?: string;
}

const PROTECTED_RESOURCE_PATH = '/.well-known/oauth-protected-resource';
const AUTHORIZATION_SERVER_PATH = '/.well-known/oauth-authorization-server';

const ensureUrl = (input: string): URL => new URL(input);

interface DiscoveryOptions {
  clientId: string;
  fetchImpl?: typeof fetch;
  resourceUrl: string;
}

const safeJson = async (response: Response): Promise<Record<string, unknown> | null> => {
  if (!response.ok) return null;
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const discoverMcpOAuthMetadata = async (options: DiscoveryOptions): Promise<McpOAuthClientConfig> => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const resourceUrl = ensureUrl(options.resourceUrl);
  const baseOrigin = `${resourceUrl.protocol}//${resourceUrl.host}`;

  const protectedResource = await safeJson(
    await fetchImpl(`${baseOrigin}${PROTECTED_RESOURCE_PATH}`, {headers: {accept: 'application/json'}}).catch(() => new Response('', {status: 500})),
  );
  const authServerHint = typeof protectedResource?.authorization_servers === 'object'
    && Array.isArray((protectedResource as {authorization_servers?: unknown}).authorization_servers)
    ? ((protectedResource as {authorization_servers: string[]}).authorization_servers[0])
    : undefined;

  const metadataBase = authServerHint ?? baseOrigin;
  const metadataUrl = `${metadataBase.replace(/\/$/u, '')}${AUTHORIZATION_SERVER_PATH}`;
  const metadataResponse = await fetchImpl(metadataUrl, {headers: {accept: 'application/json'}}).catch(() => null);
  if (!metadataResponse || !metadataResponse.ok) {
    throw new McpProtocolError(`MCP OAuth metadata discovery failed at ${metadataUrl}`, metadataResponse?.status ?? -32011);
  }
  const metadata = (await metadataResponse.json()) as RawAuthorizationServerMetadata;
  if (!metadata.token_endpoint) {
    throw new McpProtocolError('MCP OAuth metadata missing token_endpoint', -32012);
  }
  return {
    authorizationEndpoint: metadata.authorization_endpoint,
    clientId: options.clientId,
    deviceAuthorizationEndpoint: metadata.device_authorization_endpoint,
    scopes: metadata.scopes_supported,
    tokenEndpoint: metadata.token_endpoint,
  };
};
