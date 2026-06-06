import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {execa} from 'execa';

import type {EvalWorkspace} from './types.js';

const WORKSPACE_PREFIX = 'apeironcode-eval-';

export interface CreateEvalWorkspaceOptions {
  fixtures?: Record<string, string>;
  git?: boolean;
  prefix?: string;
}

const resolveInside = (cwd: string, filePath: string): string => {
  const resolved = path.resolve(cwd, filePath);
  const relative = path.relative(cwd, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Eval workspace path escapes workspace: ${filePath}`);
  }
  return resolved;
};

export const assertSafeCleanupPath = (cwd: string, tempRoot = os.tmpdir()): void => {
  const resolved = path.resolve(cwd);
  const resolvedTemp = path.resolve(tempRoot);
  const relative = path.relative(resolvedTemp, resolved);
  const baseName = path.basename(resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !baseName.startsWith(WORKSPACE_PREFIX)) {
    throw new Error(`Refusing to cleanup unsafe eval workspace path: ${cwd}`);
  }
};

export const createEvalWorkspace = async (options: CreateEvalWorkspaceOptions = {}): Promise<EvalWorkspace> => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), options.prefix ?? WORKSPACE_PREFIX));

  const workspace: EvalWorkspace = {
    cwd,
    async cleanup() {
      assertSafeCleanupPath(cwd);
      await fs.rm(cwd, {force: true, recursive: true});
    },
    async exists(filePath: string) {
      try {
        await fs.access(resolveInside(cwd, filePath));
        return true;
      } catch {
        return false;
      }
    },
    async readFile(filePath: string) {
      return fs.readFile(resolveInside(cwd, filePath), 'utf8');
    },
    async run(command: string, args: string[] = []) {
      const result = await execa(command, args, {all: false, cwd, reject: false});
      return {
        exitCode: result.exitCode ?? 0,
        stderr: result.stderr,
        stdout: result.stdout,
      };
    },
    async writeFile(filePath: string, content: string) {
      const target = resolveInside(cwd, filePath);
      await fs.mkdir(path.dirname(target), {recursive: true});
      await fs.writeFile(target, content, 'utf8');
    },
  };

  for (const [filePath, content] of Object.entries(options.fixtures ?? {})) {
    await workspace.writeFile(filePath, content);
  }

  if (options.git) {
    await workspace.run('git', ['init']);
  }

  return workspace;
};

export const snapshotWorkspaceFiles = async (workspace: EvalWorkspace): Promise<Map<string, string>> => {
  const snapshot = new Map<string, string>();

  const walk = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, {withFileTypes: true});
    for (const entry of entries) {
      if (entry.name === '.git') {
        continue;
      }
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (entry.isFile()) {
        snapshot.set(path.relative(workspace.cwd, absolute), await fs.readFile(absolute, 'utf8'));
      }
    }
  };

  await walk(workspace.cwd);
  return snapshot;
};

export const listChangedFiles = async (
  workspace: EvalWorkspace,
  initialFiles: Map<string, string>,
): Promise<string[]> => {
  const current = await snapshotWorkspaceFiles(workspace);
  const changed = new Set<string>();
  for (const [filePath, content] of current.entries()) {
    if (initialFiles.get(filePath) !== content) {
      changed.add(filePath);
    }
  }
  for (const filePath of initialFiles.keys()) {
    if (!current.has(filePath)) {
      changed.add(filePath);
    }
  }
  return Array.from(changed).sort();
};
