import {mkdir, readFile, rm, writeFile, chmod} from 'node:fs/promises';
import path from 'node:path';
import {getAppHomeDir} from '../../utils/paths.js';
import {redactString} from '../redaction.js';
import type {McpAuthStatus, McpAuthToken, McpTokenStore} from './types.js';

export const getMcpTokenPath = (serverId: string, baseDir = getAppHomeDir()): string =>
  path.join(baseDir, 'mcp-tokens', `${serverId.replace(/[^a-zA-Z0-9_.-]/gu, '_')}.json`);

export const getMcpAuthStatus = (token: McpAuthToken | null, now = Date.now()): McpAuthStatus => {
  if (!token) {
    return 'missing';
  }
  if (token.expiresAt && token.expiresAt <= now) {
    return token.refreshToken ? 'refresh_available' : 'expired';
  }
  return 'authenticated';
};

export const redactAuthToken = (value: string, token?: McpAuthToken | null): string =>
  redactString(value, [token?.accessToken, token?.refreshToken]);

export class FileMcpTokenStore implements McpTokenStore {
  constructor(private readonly baseDir = getAppHomeDir()) {}

  async get(serverId: string): Promise<McpAuthToken | null> {
    try {
      const text = await readFile(getMcpTokenPath(serverId, this.baseDir), 'utf8');
      const parsed = JSON.parse(text) as McpAuthToken;
      return parsed.tokenType === 'Bearer' && typeof parsed.accessToken === 'string' ? parsed : null;
    } catch {
      return null;
    }
  }

  async set(serverId: string, token: McpAuthToken): Promise<void> {
    const file = getMcpTokenPath(serverId, this.baseDir);
    await mkdir(path.dirname(file), {recursive: true, mode: 0o700});
    await writeFile(file, `${JSON.stringify(token, null, 2)}\n`, {mode: 0o600});
    await chmod(file, 0o600).catch(() => undefined);
  }

  async clear(serverId: string): Promise<void> {
    await rm(getMcpTokenPath(serverId, this.baseDir), {force: true});
  }
}
