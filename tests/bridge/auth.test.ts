import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
  createBridgeSecret,
  validateBridgeToken,
  getBridgeSecretPath,
  loadOrCreateBridgeSecret,
  formatBridgeAuthInstructions,
  fingerprintToken,
} from '../../src/bridge/auth.js';

const mkdtemp = async (): Promise<string> =>
  fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-bridge-auth-'));

describe('createBridgeSecret', () => {
  it('creates a secret with token, fingerprint, and createdAt', () => {
    const info = createBridgeSecret();
    expect(typeof info.token).toBe('string');
    expect(info.token.length).toBeGreaterThan(16);
    expect(typeof info.fingerprint).toBe('string');
    expect(info.fingerprint.length).toBe(12);
    expect(typeof info.createdAt).toBe('string');
  });

  it('generates unique tokens each call', () => {
    const a = createBridgeSecret();
    const b = createBridgeSecret();
    expect(a.token).not.toBe(b.token);
  });
});

describe('fingerprintToken', () => {
  it('returns 12-char hex string', () => {
    const fp = fingerprintToken('my-test-token-abc123');
    expect(fp).toMatch(/^[a-f0-9]{12}$/u);
  });

  it('is deterministic', () => {
    const fp1 = fingerprintToken('same-token');
    const fp2 = fingerprintToken('same-token');
    expect(fp1).toBe(fp2);
  });
});

describe('validateBridgeToken', () => {
  it('accepts correct token', () => {
    const info = createBridgeSecret();
    expect(validateBridgeToken(info.token, info)).toBe(true);
  });

  it('rejects wrong token', () => {
    const info = createBridgeSecret();
    expect(validateBridgeToken('wrong-token', info)).toBe(false);
  });

  it('rejects empty string', () => {
    const info = createBridgeSecret();
    expect(validateBridgeToken('', info)).toBe(false);
  });

  it('rejects tokens of different length', () => {
    const info = createBridgeSecret();
    expect(validateBridgeToken(info.token + 'x', info)).toBe(false);
  });
});

describe('getBridgeSecretPath', () => {
  it('returns path inside ApeironCode runtime dir, not repo source', () => {
    const secretPath = getBridgeSecretPath('/my/project');
    expect(secretPath).toContain('.apeironcode-agent');
    expect(secretPath).not.toBe('/my/project');
  });
});

describe('loadOrCreateBridgeSecret', () => {
  let tmpDir: string;

  beforeEach(async () => { tmpDir = await mkdtemp(); });
  afterEach(async () => { await fs.rm(tmpDir, {recursive: true, force: true}); });

  it('creates a new secret when none exists', async () => {
    const info = await loadOrCreateBridgeSecret(tmpDir);
    expect(typeof info.token).toBe('string');
    expect(info.token.length).toBeGreaterThan(16);
  });

  it('returns same secret on second call', async () => {
    const first = await loadOrCreateBridgeSecret(tmpDir);
    const second = await loadOrCreateBridgeSecret(tmpDir);
    expect(first.token).toBe(second.token);
  });

  it('secret path is inside the tmpDir ApeironCode dir', async () => {
    await loadOrCreateBridgeSecret(tmpDir);
    const secretPath = getBridgeSecretPath(tmpDir);
    const exists = await fs.access(secretPath).then(() => true, () => false);
    expect(exists).toBe(true);
  });
});

describe('formatBridgeAuthInstructions', () => {
  it('shows fingerprint in hint', () => {
    const info = createBridgeSecret();
    const instructions = formatBridgeAuthInstructions(info, '/path/to/secret');
    expect(instructions.hint).toContain(info.fingerprint);
    expect(instructions.fingerprint).toBe(info.fingerprint);
  });

  it('does not include full token in hint', () => {
    const info = createBridgeSecret();
    const instructions = formatBridgeAuthInstructions(info, '/path/to/secret');
    expect(instructions.hint).not.toContain(info.token);
  });
});
