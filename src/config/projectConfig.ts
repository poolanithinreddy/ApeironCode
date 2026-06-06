import {readFile} from 'node:fs/promises';

import {fileExists, readJsonFile} from '../utils/fs.js';
import {
  getIgnoreFilePath,
  getProjectConfigPath,
  getProjectMemoryPath,
} from '../utils/paths.js';
import type {ApeironCodeConfigInput} from './config.js';

export interface ProjectRuntimeFiles {
  configPath: string;
  ignoreFilePath: string;
  memoryFilePath: string;
}

export const getProjectRuntimeFiles = (cwd: string): ProjectRuntimeFiles => ({
  configPath: getProjectConfigPath(cwd),
  ignoreFilePath: getIgnoreFilePath(cwd),
  memoryFilePath: getProjectMemoryPath(cwd),
});

export const loadProjectConfig = async (
  cwd: string,
): Promise<Partial<ApeironCodeConfigInput>> => {
  const configPath = getProjectConfigPath(cwd);
  return readJsonFile<Partial<ApeironCodeConfigInput>>(configPath, {});
};

export const loadIgnorePatterns = async (cwd: string): Promise<string[]> => {
  const ignoreFilePath = getIgnoreFilePath(cwd);

  if (!(await fileExists(ignoreFilePath))) {
    return [];
  }

  const raw = await readFile(ignoreFilePath, 'utf8');
  return raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
};

export const loadProjectMemory = async (cwd: string): Promise<string | null> => {
  const memoryFilePath = getProjectMemoryPath(cwd);

  if (!(await fileExists(memoryFilePath))) {
    return null;
  }

  return readFile(memoryFilePath, 'utf8');
};