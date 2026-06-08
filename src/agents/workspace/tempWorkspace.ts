import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {ensureDirectory} from '../../utils/fs.js';
import type {SubagentWorkspace} from './types.js';

const IGNORED_COPY_NAMES = new Set(['.git', 'dist', 'node_modules']);

export const createTempWorkspace = async (input: {
  agentName: string;
  mainRoot: string;
  teamRunId: string;
  workspaceId: string;
}): Promise<SubagentWorkspace> => {
  const baseDir = path.join(os.tmpdir(), 'apeironcode-agent-workspaces');
  await ensureDirectory(baseDir);
  const workspaceRoot = await fs.mkdtemp(path.join(baseDir, `${input.workspaceId}-`));
  await fs.cp(input.mainRoot, workspaceRoot, {
    filter: (source) => !IGNORED_COPY_NAMES.has(path.basename(source)),
    recursive: true,
  });
  return {
    agentName: input.agentName,
    cleanup: true,
    createdAt: new Date().toISOString(),
    mainRoot: input.mainRoot,
    mode: 'temp-copy',
    status: 'active',
    teamRunId: input.teamRunId,
    workspaceId: input.workspaceId,
    workspaceRoot,
  };
};

export const cleanupTempWorkspace = async (workspace: SubagentWorkspace): Promise<void> => {
  if (workspace.mode !== 'temp-copy' || !workspace.cleanup) {
    return;
  }
  await fs.rm(workspace.workspaceRoot, {force: true, recursive: true});
};
