import path from 'node:path';
import {createHash} from 'node:crypto';

import {redactSecrets} from '../share/redactor.js';

export const redactProjectBrainText = (text: string): string =>
  redactSecrets(text).replace(/[A-Za-z0-9_-]{32,}/gu, '[REDACTED]');

export const getProjectName = (cwd: string): string => path.basename(path.resolve(cwd)) || 'project';

export const createProjectRootFingerprint = (cwd: string): string => {
  const name = getProjectName(cwd);
  const hash = createHash('sha256').update(path.resolve(cwd)).digest('hex').slice(0, 12);
  return `${name}-${hash}`;
};

export const toProjectRelativePath = (cwd: string, filePath: string): string => {
  const relative = path.relative(cwd, filePath).replaceAll(path.sep, '/');
  return relative && !relative.startsWith('..') ? relative : path.basename(filePath);
};

export const truncateForPrompt = (text: string, maxChars: number): string => {
  const safe = redactProjectBrainText(text).trim();
  return safe.length <= maxChars ? safe : `${safe.slice(0, maxChars - 1).trimEnd()}…`;
};
