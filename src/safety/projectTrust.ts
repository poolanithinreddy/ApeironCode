import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {getAppHomeDir} from '../utils/paths.js';

export type TrustLevel = 'trusted' | 'untrusted' | 'unknown';

export interface ProjectTrustStatus {
  cwd: string;
  trust: TrustLevel;
  trustedAt?: number;
  reason?: string;
  warnings: string[];
}

export interface TrustAction {
  requiresTrust: boolean;
  action: string;
  reason: string;
}

interface TrustStoreEntry {
  trust: TrustLevel;
  trustedAt?: number;
  reason?: string;
}

interface TrustStoreFile {
  version: 1;
  entries: Record<string, TrustStoreEntry>;
}

const STORE_FILE = 'project-trust.json';

const getStorePath = (): string => path.join(getAppHomeDir(), STORE_FILE);

const isInTmpDir = (cwd: string): boolean => {
  try {
    const real = fs.realpathSync(cwd);
    const tmp = fs.realpathSync(os.tmpdir());
    return real === tmp || real.startsWith(tmp + path.sep);
  } catch {
    return cwd.startsWith(os.tmpdir());
  }
};

const readStore = (): TrustStoreFile => {
  try {
    const raw = fs.readFileSync(getStorePath(), 'utf8');
    const parsed = JSON.parse(raw) as TrustStoreFile;
    if (parsed && typeof parsed === 'object' && parsed.entries) return parsed;
  } catch {
    // ignore
  }
  return {version: 1, entries: {}};
};

const writeStore = (store: TrustStoreFile): void => {
  const dir = getAppHomeDir();
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(getStorePath(), JSON.stringify(store, null, 2), 'utf8');
};

const normalizeKey = (cwd: string): string => {
  try {
    return fs.realpathSync(cwd);
  } catch {
    return path.resolve(cwd);
  }
};

const sanitizeReason = (reason?: string): string | undefined => {
  if (!reason) return undefined;
  // Replace token-like sequences and never store path-fragments that look like secrets
  return reason.replace(/[A-Za-z0-9_-]{24,}/gu, '[redacted]').slice(0, 200);
};

export const getProjectTrustStatus = (cwd: string): ProjectTrustStatus => {
  const warnings: string[] = [];
  if (isInTmpDir(cwd)) {
    warnings.push('temp directory always treated as untrusted');
    return {cwd, trust: 'untrusted', warnings};
  }
  const store = readStore();
  const key = normalizeKey(cwd);
  const entry = store.entries[key];
  if (!entry) {
    return {cwd, trust: 'unknown', warnings: ['no trust decision recorded; treated as untrusted']};
  }
  return {cwd, trust: entry.trust, trustedAt: entry.trustedAt, reason: entry.reason, warnings};
};

export const markProjectTrusted = (cwd: string, reason?: string): ProjectTrustStatus => {
  if (isInTmpDir(cwd)) {
    return {
      cwd,
      trust: 'untrusted',
      warnings: ['temp directories cannot be marked trusted'],
    };
  }
  const store = readStore();
  const key = normalizeKey(cwd);
  const sanitized = sanitizeReason(reason);
  const entry: TrustStoreEntry = {trust: 'trusted', trustedAt: Date.now(), reason: sanitized};
  store.entries[key] = entry;
  writeStore(store);
  return {cwd, trust: 'trusted', trustedAt: entry.trustedAt, reason: sanitized, warnings: []};
};

export const markProjectUntrusted = (cwd: string): ProjectTrustStatus => {
  const store = readStore();
  const key = normalizeKey(cwd);
  store.entries[key] = {trust: 'untrusted'};
  writeStore(store);
  return {cwd, trust: 'untrusted', warnings: []};
};

const TRUST_REQUIRED_ACTIONS: Record<string, string> = {
  'load-hooks': 'Loading project-level hooks may execute project code',
  'load-plugins': 'Loading project-level plugins may execute untrusted code',
  'load-mcp-config': 'Loading MCP server config from project may launch untrusted servers',
  'load-project-permissions': 'Project permissions may grant elevated access',
  'run-project-script': 'Running project scripts can execute arbitrary code',
};

export const requiresTrustForAction = (action: string): TrustAction => {
  const reason = TRUST_REQUIRED_ACTIONS[action];
  if (reason) return {requiresTrust: true, action, reason};
  return {requiresTrust: false, action, reason: 'no trust required'};
};

export const formatProjectTrustWarning = (status: ProjectTrustStatus): string => {
  const lines: string[] = [];
  lines.push(`Project trust: ${status.trust}`);
  lines.push(`cwd: ${status.cwd}`);
  for (const w of status.warnings) lines.push(`- ${w}`);
  if (status.reason) lines.push(`reason: ${status.reason}`);
  // No secrets: reason already sanitized at write time
  return lines.join('\n');
};
