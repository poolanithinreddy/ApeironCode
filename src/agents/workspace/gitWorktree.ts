import path from 'node:path';

import {execa} from 'execa';

import {ensureDirectory} from '../../utils/fs.js';
import type {SubagentWorkspace} from './types.js';

export interface GitWorktreePlan {
  addArgs: string[];
  branchName: string;
  removeArgs: string[];
  workspaceRoot: string;
}

export const createGitWorktreePlan = (input: {
  agentName: string;
  mainRoot: string;
  teamRunId: string;
  workspaceId: string;
}): GitWorktreePlan => {
  const branchName = `apeironcode/${input.teamRunId}/${input.agentName}`;
  const workspaceRoot = path.join(input.mainRoot, '.apeironcode-agent', 'worktrees', input.teamRunId, input.workspaceId);
  return {
    addArgs: ['worktree', 'add', '--detach', workspaceRoot, 'HEAD'],
    branchName,
    removeArgs: ['worktree', 'remove', '--force', workspaceRoot],
    workspaceRoot,
  };
};

export const isPathInside = (candidate: string, root: string): boolean => {
  const relative = path.relative(root, candidate);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
};

export const getGitRepoRoot = async (cwd: string): Promise<string | null> => {
  try {
    const {stdout} = await execa('git', ['-C', cwd, 'rev-parse', '--show-toplevel']);
    return stdout.trim() || null;
  } catch {
    return null;
  }
};

export const isGitWorktreeAvailable = async (cwd: string): Promise<boolean> => {
  try {
    await execa('git', ['-C', cwd, 'worktree', 'list', '--porcelain']);
    return true;
  } catch {
    return false;
  }
};

export const createGitWorktreeWorkspace = async (input: {
  agentName: string;
  mainRoot: string;
  teamRunId: string;
  workspaceId: string;
}): Promise<SubagentWorkspace> => {
  const repoRoot = await getGitRepoRoot(input.mainRoot);
  if (!repoRoot) {
    throw new Error('Git worktree workspace requires a git repository.');
  }
  if (!(await isGitWorktreeAvailable(repoRoot))) {
    throw new Error('Git worktree is not available for this repository.');
  }
  const {stdout: status} = await execa('git', ['-C', repoRoot, 'status', '--porcelain', '--untracked-files=no']);
  if (status.trim()) {
    throw new Error('Git worktree workspace requires a clean git working tree. Commit, stash, or use --workspace temp-copy.');
  }

  const plan = createGitWorktreePlan({...input, mainRoot: repoRoot});
  const worktreesRoot = path.join(repoRoot, '.apeironcode-agent', 'worktrees');
  if (!isPathInside(plan.workspaceRoot, worktreesRoot)) {
    throw new Error('Refusing to create git worktree outside .apeironcode-agent/worktrees.');
  }

  await ensureDirectory(path.dirname(plan.workspaceRoot));
  await execa('git', ['-C', repoRoot, ...plan.addArgs]);

  return {
    agentName: input.agentName,
    cleanup: true,
    createdAt: new Date().toISOString(),
    git: {
      branchName: plan.branchName,
      detached: true,
      repoRoot,
    },
    mainRoot: repoRoot,
    mode: 'git-worktree',
    status: 'active',
    teamRunId: input.teamRunId,
    workspaceId: input.workspaceId,
    workspaceRoot: plan.workspaceRoot,
  };
};

export const cleanupGitWorktree = async (workspace: SubagentWorkspace): Promise<void> => {
  if (workspace.mode !== 'git-worktree' || !workspace.cleanup) {
    return;
  }
  const repoRoot = workspace.git?.repoRoot ?? workspace.mainRoot;
  const worktreesRoot = path.join(repoRoot, '.apeironcode-agent', 'worktrees');
  if (!isPathInside(workspace.workspaceRoot, worktreesRoot)) {
    throw new Error(`Refusing to clean git worktree outside ${worktreesRoot}: ${workspace.workspaceRoot}`);
  }
  await execa('git', ['-C', repoRoot, 'worktree', 'remove', '--force', workspace.workspaceRoot]).catch(async () => {
    await execa('git', ['-C', repoRoot, 'worktree', 'prune']).catch(() => undefined);
  });
};
