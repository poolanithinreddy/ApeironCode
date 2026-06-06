/**
 * ApeironCode Bridge — Runtime connection file.
 * Written when bridge starts so VS Code extension can auto-discover endpoint.
 * Contains endpoint + token fingerprint ONLY — never the full token.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {getProjectConfigDir} from '../utils/paths.js';

const CONNECTION_FILE_NAME = 'bridge-connection.json';

export interface BridgeConnectionInfo {
  /** ws://127.0.0.1:<port> */
  endpoint: string;
  /** Short SHA-256 fingerprint (first 12 hex chars) — NOT the full token. */
  tokenFingerprint: string;
  /** ISO timestamp when bridge started. */
  startedAt: string;
  /** Process ID of the bridge server process. */
  pid: number;
}

export const getBridgeConnectionFilePath = (cwd: string): string =>
  path.join(getProjectConfigDir(cwd), CONNECTION_FILE_NAME);

/** Writes the connection file. Full token is NEVER written. */
export const writeBridgeConnectionFile = async (
  cwd: string,
  info: BridgeConnectionInfo,
): Promise<void> => {
  const filePath = getBridgeConnectionFilePath(cwd);
  await fs.mkdir(path.dirname(filePath), {recursive: true});
  await fs.writeFile(filePath, JSON.stringify(info, null, 2), {mode: 0o644});
};

/** Reads the connection file if it exists. Returns null on failure. */
export const readBridgeConnectionFile = async (
  cwd: string,
): Promise<BridgeConnectionInfo | null> => {
  const filePath = getBridgeConnectionFilePath(cwd);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>)['endpoint'] === 'string' &&
      typeof (parsed as Record<string, unknown>)['tokenFingerprint'] === 'string'
    ) {
      return parsed as BridgeConnectionInfo;
    }
    return null;
  } catch {
    return null;
  }
};

/** Removes the connection file (on bridge stop). */
export const removeBridgeConnectionFile = async (cwd: string): Promise<void> => {
  const filePath = getBridgeConnectionFilePath(cwd);
  await fs.rm(filePath, {force: true});
};

/** Validates a connection info object has no full token fields. */
export const validateConnectionInfoSafe = (info: BridgeConnectionInfo): boolean => {
  const text = JSON.stringify(info);
  // Ensure no 64-char hex strings (bridge tokens are 64 hex chars)
  return !/[0-9a-f]{64}/i.test(text);
};
