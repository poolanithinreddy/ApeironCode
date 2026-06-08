/**
 * ApeironCode Bridge — local workspace auth / secret management.
 * Secrets are never printed in full in normal output.
 */

import {randomBytes, timingSafeEqual, createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {getProjectConfigDir} from '../utils/paths.js';

const SECRET_FILE_NAME = 'bridge-secret.json';
const SECRET_BYTE_LENGTH = 32;

export interface BridgeSecretInfo {
  /** Full token — treat as secret, never print. */
  token: string;
  /** Short SHA-256 fingerprint (first 12 hex chars). */
  fingerprint: string;
  /** When the secret was created. */
  createdAt: string;
}

/** Derives the runtime dir path for bridge secrets (inside ApeironCode project dir, NOT source). */
export const getBridgeSecretPath = (cwd: string): string =>
  path.join(getProjectConfigDir(cwd), SECRET_FILE_NAME);

/** Generates a new cryptographically random bridge token. */
export const createBridgeSecret = (): BridgeSecretInfo => {
  const token = randomBytes(SECRET_BYTE_LENGTH).toString('hex');
  return {
    token,
    fingerprint: fingerprintToken(token),
    createdAt: new Date().toISOString(),
  };
};

/** Returns a short non-secret fingerprint of a token. */
export const fingerprintToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex').slice(0, 12);

/**
 * Loads the bridge secret from disk, or creates and persists a new one.
 * The secret file is stored under the ApeironCode project runtime dir.
 */
export const loadOrCreateBridgeSecret = async (cwd: string): Promise<BridgeSecretInfo> => {
  const secretPath = getBridgeSecretPath(cwd);
  try {
    const raw = await fs.readFile(secretPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>)['token'] === 'string' &&
      typeof (parsed as Record<string, unknown>)['fingerprint'] === 'string'
    ) {
      return parsed as BridgeSecretInfo;
    }
  } catch {
    // File does not exist or is malformed — create new.
  }

  const info = createBridgeSecret();
  await fs.mkdir(path.dirname(secretPath), {recursive: true});
  await fs.writeFile(secretPath, JSON.stringify(info, null, 2), {mode: 0o600});
  return info;
};

/**
 * Validates that `token` matches the stored `secret.token` using timing-safe comparison.
 * Returns false if tokens differ or have different lengths (avoids timing attacks).
 */
export const validateBridgeToken = (token: string, secret: BridgeSecretInfo): boolean => {
  if (typeof token !== 'string' || token.length === 0) return false;
  try {
    const a = Buffer.from(token, 'utf8');
    const b = Buffer.from(secret.token, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
};

export interface BridgeAuthInstructions {
  fingerprint: string;
  secretPath: string;
  hint: string;
}

/**
 * Formats auth instructions for display.
 * Shows fingerprint only — never the full token.
 */
export const formatBridgeAuthInstructions = (
  secretInfo: BridgeSecretInfo,
  secretPath: string,
): BridgeAuthInstructions => ({
  fingerprint: secretInfo.fingerprint,
  secretPath,
  hint: [
    `Bridge token fingerprint: ${secretInfo.fingerprint}`,
    `Token stored at: ${secretPath}`,
    'Use the token value from that file to authenticate bridge clients.',
    'Do not share the full token; share only the fingerprint for verification.',
  ].join('\n'),
});
