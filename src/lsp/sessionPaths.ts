import path from 'node:path';

export interface LspSessionPathOptions {
  serverArgs?: string[];
  serverCommand: string;
}

export const toDisplayPath = (filePath: string, cwd: string): string => {
  if (!path.isAbsolute(filePath)) {
    return filePath;
  }

  const relativePath = path.relative(cwd, filePath);
  return relativePath && !relativePath.startsWith('..') ? relativePath : filePath;
};

export const toServerId = (options: LspSessionPathOptions): string => {
  return [options.serverCommand, ...(options.serverArgs ?? [])].join(' ');
};

export const resolveWorkspacePath = (workspaceRoot: string, filePath: string): string => {
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(workspaceRoot, filePath);
};

export const resolveFilePath = (filePath: string): string => path.resolve(filePath);
