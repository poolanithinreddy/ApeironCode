import fs from 'node:fs/promises';
import path from 'node:path';

const BUILTIN_IGNORES = [
  '.git/',
  '.apeironcode-agent/',
  'node_modules/',
  'dist/',
  'coverage/',
  '.DS_Store',
  '.npm/',
  '.cache/',
  '.rustup/',
  'home/.npm/',
  'home/.cache/',
  'home/.rustup/',
  'logs/',
  '*.log',
  '*.tmp',
];

export interface WorkspaceIgnoreMatch {
  path: string;
  rule: string;
  source: 'builtin' | 'gitignore' | 'apeironcodeignore' | 'opencodeignore';
}

export interface WorkspaceIgnoreRules {
  matches(relativePath: string): WorkspaceIgnoreMatch | null;
  rules: Array<{pattern: string; source: WorkspaceIgnoreMatch['source']}>;
}

const readIgnoreFile = async (
  root: string,
  fileName: string,
  source: WorkspaceIgnoreMatch['source'],
): Promise<Array<{pattern: string; source: WorkspaceIgnoreMatch['source']}>> => {
  const raw = await fs.readFile(path.join(root, fileName), 'utf8').catch(() => '');
  return raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('!'))
    .map((pattern) => ({pattern, source}));
};

const wildcardToRegExp = (pattern: string): RegExp => {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/gu, '\\$&').replace(/\*/gu, '.*');
  return new RegExp(`(^|/)${escaped}$`, 'u');
};

const matchesPattern = (relativePath: string, pattern: string): boolean => {
  const normalized = relativePath.replace(/\\/gu, '/');
  const cleanPattern = pattern.replace(/^\/+/u, '').replace(/\\/gu, '/');
  if (cleanPattern.endsWith('/')) {
    const prefix = cleanPattern.slice(0, -1);
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  }
  if (cleanPattern.includes('*')) {
    return wildcardToRegExp(cleanPattern).test(normalized);
  }
  return normalized === cleanPattern
    || normalized.endsWith(`/${cleanPattern}`)
    || normalized.startsWith(`${cleanPattern}/`);
};

export const loadWorkspaceIgnoreRules = async (root: string): Promise<WorkspaceIgnoreRules> => {
  const rules = [
    ...BUILTIN_IGNORES.map((pattern) => ({pattern, source: 'builtin' as const})),
    ...await readIgnoreFile(root, '.gitignore', 'gitignore'),
    ...await readIgnoreFile(root, '.apeironcodeignore', 'apeironcodeignore'),
    // Legacy fallback for projects that still use `.opencodeignore`.
    ...await readIgnoreFile(root, '.opencodeignore', 'opencodeignore'),
  ];

  return {
    matches(relativePath: string): WorkspaceIgnoreMatch | null {
      const match = rules.find((rule) => matchesPattern(relativePath, rule.pattern));
      return match ? {path: relativePath, rule: match.pattern, source: match.source} : null;
    },
    rules,
  };
};
