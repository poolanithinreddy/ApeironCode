import fs from 'node:fs/promises';
import path from 'node:path';

export const ensureDirectory = async (directoryPath: string): Promise<void> => {
  await fs.mkdir(directoryPath, {recursive: true});
};

export const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

export const readTextFile = async (filePath: string): Promise<string> => {
  return fs.readFile(filePath, 'utf8');
};

export const writeTextFile = async (filePath: string, content: string): Promise<void> => {
  await ensureDirectory(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf8');
};

export const readJsonFile = async <T>(
  filePath: string,
  fallback: T,
): Promise<T> => {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const readJsonFileStrict = async <T>(filePath: string): Promise<T> => {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
};

export const writeJsonFile = async <T>(filePath: string, value: T): Promise<void> => {
  await writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
};