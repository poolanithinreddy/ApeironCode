import {readFile} from 'node:fs/promises';
import path from 'node:path';

import fg from 'fast-glob';
import ignore from 'ignore';

import {fileExists} from '../utils/fs.js';

export const DEFAULT_IGNORE_PATTERNS = [
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  '.venv',
  'target',
  'vendor',
  '.cache',
];

const readIgnoreFile = async (filePath: string): Promise<string[]> => {
  if (!(await fileExists(filePath))) {
    return [];
  }

  const raw = await readFile(filePath, 'utf8');
  return raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
};

export const loadProjectIgnorePatterns = async (cwd: string): Promise<string[]> => {
  const [gitIgnore, apeironIgnore, legacyOpenCodeIgnore] = await Promise.all([
    readIgnoreFile(path.join(cwd, '.gitignore')),
    readIgnoreFile(path.join(cwd, '.apeironcodeignore')),
    // Legacy fallback for projects that still use `.opencodeignore`.
    readIgnoreFile(path.join(cwd, '.opencodeignore')),
  ]);

  return Array.from(new Set([
    ...DEFAULT_IGNORE_PATTERNS,
    ...gitIgnore,
    ...apeironIgnore,
    ...legacyOpenCodeIgnore,
  ]));
};

export const createIgnoreMatcher = (patterns: string[]) => {
  const matcher = ignore();
  matcher.add(patterns);
  return matcher;
};

export const listProjectFiles = async (cwd: string, patterns: string[]): Promise<string[]> => {
  const entries = await fg(['**/*'], {
    cwd,
    dot: false,
    ignore: patterns,
    onlyFiles: true,
  });
  const matcher = createIgnoreMatcher(patterns);
  return entries.filter((entry) => !matcher.ignores(entry));
};