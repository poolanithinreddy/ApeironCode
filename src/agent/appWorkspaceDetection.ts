/**
 * Deterministic detection of app files/directories in the workspace.
 * Used to (a) route vague follow-up modification prompts to the existing-app
 * file-plan flow and (b) locate the app directory for "run this app".
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const IGNORE_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.next', 'coverage']);

export interface AppDirectory {
  /** Relative directory ('' for workspace root). */
  dir: string;
  hasPackageJson: boolean;
  hasIndexHtml: boolean;
  /** Partial framework scaffold (package.json + pages/ or styles/ or app/). */
  partialApp: boolean;
}

const safeReaddir = async (dir: string): Promise<string[]> => {
  try {
    return (await fs.readdir(dir, {withFileTypes: true}))
      .filter((entry) => entry.isDirectory() && !IGNORE_DIRS.has(entry.name) && !entry.name.startsWith('.'))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
};

const fileExists = async (target: string): Promise<boolean> => {
  try {
    await fs.stat(target);
    return true;
  } catch {
    return false;
  }
};

const inspectDir = async (cwd: string, rel: string): Promise<AppDirectory | null> => {
  const abs = path.join(cwd, rel);
  const hasPackageJson = await fileExists(path.join(abs, 'package.json'));
  const hasIndexHtml = await fileExists(path.join(abs, 'index.html'));
  if (!hasPackageJson && !hasIndexHtml) return null;
  const partialApp =
    hasPackageJson &&
    ((await fileExists(path.join(abs, 'pages'))) ||
      (await fileExists(path.join(abs, 'styles'))) ||
      (await fileExists(path.join(abs, 'app'))));
  return {dir: rel, hasPackageJson, hasIndexHtml, partialApp};
};

/** All directories (root + one level deep) that look like an app. */
export const findAppDirectories = async (cwd: string): Promise<AppDirectory[]> => {
  const found: AppDirectory[] = [];
  const root = await inspectDir(cwd, '');
  if (root) found.push(root);
  for (const name of await safeReaddir(cwd)) {
    const nested = await inspectDir(cwd, name);
    if (nested) found.push(nested);
  }
  return found;
};

export const hasWorkspaceAppFiles = async (cwd: string): Promise<boolean> =>
  (await findAppDirectories(cwd)).length > 0;

const tokenize = (value: string): string[] =>
  value.toLowerCase().split(/[^a-z0-9]+/u).filter(Boolean);

/**
 * Fuzzy-match a user hint ("todo") to an app directory ("todo-list").
 * Returns the best AppDirectory or null.
 */
export const resolveAppDirByHint = (
  dirs: AppDirectory[],
  hint: string | undefined,
): AppDirectory | null => {
  if (dirs.length === 0) return null;
  if (!hint) {
    return dirs.find((d) => d.dir !== '') ?? dirs[0]!;
  }
  const hintTokens = tokenize(hint);
  let best: {dir: AppDirectory; score: number} | null = null;
  for (const dir of dirs) {
    if (dir.dir === '') continue;
    const dirTokens = tokenize(dir.dir);
    let score = 0;
    for (const ht of hintTokens) {
      if (dirTokens.includes(ht)) score += 2;
      else if (dirTokens.some((dt) => dt.startsWith(ht) || ht.startsWith(dt))) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) best = {dir, score};
  }
  return best?.dir ?? dirs.find((d) => d.dir !== '') ?? dirs[0]!;
};
