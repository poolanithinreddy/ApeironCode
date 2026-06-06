export interface McpOAuthClientConfig {
  authorizationEndpoint?: string;
  clientId: string;
  deviceAuthorizationEndpoint?: string;
  scopes?: string[];
  tokenEndpoint: string;
}

export interface McpAuthToken {
  accessToken: string;
  expiresAt?: number;
  refreshToken?: string;
  scope?: string;
  tokenType: 'Bearer';
}

export type McpAuthStatus = 'authenticated' | 'expired' | 'missing' | 'refresh_available';

export interface McpDeviceAuthorization {
  deviceCode: string;
  expiresIn: number;
  interval?: number;
  userCode: string;
  verificationUri: string;
}

export interface McpTokenStore {
  clear(serverId: string): Promise<void>;
  get(serverId: string): Promise<McpAuthToken | null>;
  set(serverId: string, token: McpAuthToken): Promise<void>;
}
