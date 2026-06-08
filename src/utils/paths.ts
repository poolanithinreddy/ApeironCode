import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ApeironCode brand: the primary on-disk directory is `.apeironcode-agent`.
// `.opencode-agent` is preserved as a legacy fallback for projects that have
// not yet migrated. When both exist, the new ApeironCode directory wins.
export const APP_DIR_NAME = '.apeironcode-agent';
export const LEGACY_APP_DIR_NAME = '.opencode-agent';
export const PROJECT_CONFIG_DIR_NAME = APP_DIR_NAME;
export const LEGACY_PROJECT_CONFIG_DIR_NAME = LEGACY_APP_DIR_NAME;
export const PROJECT_MEMORY_FILE_NAME = 'memory.md';
export const PROJECT_CONFIG_FILE_NAME = 'config.json';
export const IGNORE_FILE_NAME = '.apeironcodeignore';
export const LEGACY_IGNORE_FILE_NAME = '.opencodeignore';

// Deprecated compatibility aliases for older imports. Prefer the canonical
// `APP_DIR_NAME` / `IGNORE_FILE_NAME` constants in new code.
/** @deprecated Use APP_DIR_NAME (now `.apeironcode-agent`). */
export const NEW_APP_DIR_NAME = APP_DIR_NAME;
/** @deprecated Use PROJECT_CONFIG_DIR_NAME (now `.apeironcode-agent`). */
export const NEW_PROJECT_CONFIG_DIR_NAME = PROJECT_CONFIG_DIR_NAME;
/** @deprecated Use IGNORE_FILE_NAME (now `.apeironcodeignore`). */
export const NEW_IGNORE_FILE_NAME = IGNORE_FILE_NAME;

const directoryExists = (dir: string): boolean => {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
};

const fileExists = (file: string): boolean => {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
};

export const getUserHomeDir = (): string => os.homedir();

export const getAppHomeDir = (): string => {
  const home = getUserHomeDir();
  const primary = path.join(home, APP_DIR_NAME);
  if (directoryExists(primary)) return primary;
  // Legacy fallback: honour an existing `.opencode-agent` directory if the
  // user has not migrated yet.
  const legacy = path.join(home, LEGACY_APP_DIR_NAME);
  if (directoryExists(legacy)) return legacy;
  return primary;
};

/**
 * One-time, best-effort migration of the legacy `~/.opencode-agent` home to
 * the ApeironCode-branded `~/.apeironcode-agent` home. Non-destructive: the
 * legacy directory is left intact for rollback. Safe to call repeatedly and
 * never throws (a failed migration must not break the CLI).
 *
 * Returns true when a migration was performed this call.
 */
export const migrateLegacyAppHome = (): boolean => {
  try {
    const home = getUserHomeDir();
    const primary = path.join(home, APP_DIR_NAME);
    const legacy = path.join(home, LEGACY_APP_DIR_NAME);
    if (directoryExists(primary) || !directoryExists(legacy)) {
      return false;
    }
    fs.cpSync(legacy, primary, {recursive: true, errorOnExist: false, force: false});
    return true;
  } catch {
    return false;
  }
};

export const getGlobalConfigPath = (): string =>
  path.join(getAppHomeDir(), PROJECT_CONFIG_FILE_NAME);

export const getSessionsDir = (): string => path.join(getAppHomeDir(), 'sessions');

export const getTranscriptsDir = (): string => path.join(getAppHomeDir(), 'transcripts');

export const getSessionTranscriptPath = (sessionId: string): string =>
  path.join(getTranscriptsDir(), `${sessionId}.json`);

export const getSessionBackupsDir = (sessionId: string): string =>
  path.join(getAppHomeDir(), 'backups', sessionId);

export const getSessionBackupPath = (sessionId: string, filePath: string): string =>
  path.join(getSessionBackupsDir(sessionId), filePath.replace(/[/:\\]/gu, '__'));

export const getProjectHistoryDir = (cwd: string): string =>
  path.join(getProjectConfigDir(cwd), 'history');

export const getProjectEditHistoryPath = (cwd: string): string =>
  path.join(getProjectHistoryDir(cwd), 'edits.jsonl');

export const getProjectBackupDir = (cwd: string): string =>
  path.join(getProjectHistoryDir(cwd), 'backups');

export const getProjectTasksDir = (cwd: string): string =>
  path.join(getProjectConfigDir(cwd), 'tasks');

export const getProjectSessionsDir = (cwd: string): string =>
  path.join(getProjectConfigDir(cwd), 'sessions');

export const getRepoMapPath = (cwd: string): string =>
  path.join(getProjectConfigDir(cwd), 'repo-map.json');

export const getProjectConfigDir = (cwd: string): string => {
  const primary = path.join(cwd, PROJECT_CONFIG_DIR_NAME);
  if (directoryExists(primary)) return primary;
  // Legacy fallback for projects that still use `.opencode-agent`.
  const legacy = path.join(cwd, LEGACY_PROJECT_CONFIG_DIR_NAME);
  if (directoryExists(legacy)) return legacy;
  return primary;
};

/** @deprecated Use getProjectConfigDir, which now defaults to `.apeironcode-agent`. */
export const getNewProjectConfigDir = (cwd: string): string =>
  path.join(cwd, PROJECT_CONFIG_DIR_NAME);

export const getProjectConfigPath = (cwd: string): string =>
  path.join(getProjectConfigDir(cwd), PROJECT_CONFIG_FILE_NAME);

export const getProjectMemoryPath = (cwd: string): string =>
  path.join(getProjectConfigDir(cwd), PROJECT_MEMORY_FILE_NAME);

export const getIgnoreFilePath = (cwd: string): string => {
  const primary = path.join(cwd, IGNORE_FILE_NAME);
  if (fileExists(primary)) return primary;
  // Legacy fallback for projects with a `.opencodeignore` file.
  const legacy = path.join(cwd, LEGACY_IGNORE_FILE_NAME);
  if (fileExists(legacy)) return legacy;
  return primary;
};

export const getPlanStoragePath = (cwd: string): string =>
  path.join(getProjectConfigDir(cwd), 'plans');

export const isSubPath = (parentPath: string, candidatePath: string): boolean => {
  const relativePath = path.relative(parentPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
};

/** Directory for background task records (Phase 16D). */
export const getProjectBgTasksDir = (cwd: string): string =>
  path.join(getProjectConfigDir(cwd), 'bg-tasks');

/** Directory for ApeironCode-managed agent worktrees (Phase 16D). */
export const getProjectWorktreesDir = (cwd: string): string =>
  path.join(getProjectConfigDir(cwd), 'worktrees');
