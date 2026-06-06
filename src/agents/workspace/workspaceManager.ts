import fs from 'node:fs/promises';
import path from 'node:path';

import {ensureDirectory, readJsonFile, writeJsonFile} from '../../utils/fs.js';
import {getProjectConfigDir} from '../../utils/paths.js';
import {collectWorkspaceDiff, collectWorkspaceSnapshot} from './diffCollector.js';
import {cleanupGitWorktree, createGitWorktreeWorkspace} from './gitWorktree.js';
import {applyMergePlan, createMergePlan} from './mergeEngine.js';
import {cleanupTempWorkspace, createTempWorkspace} from './tempWorkspace.js';
import type {MergePlan, SubagentWorkspace, SubagentWorkspaceMode, WorkspaceDiff} from './types.js';
import {loadResolutionState} from './resolution.js';

interface WorkspaceStore {
  workspaces: SubagentWorkspace[];
}

const getWorkspacesDir = (cwd: string): string => path.join(getProjectConfigDir(cwd), 'teams', 'workspaces');
const getStorePath = (cwd: string): string => path.join(getWorkspacesDir(cwd), 'workspaces.json');

export class SubagentWorkspaceManager {
  constructor(private readonly cwd: string) {}

  private async loadStore(): Promise<WorkspaceStore> {
    const store = await readJsonFile<WorkspaceStore>(getStorePath(this.cwd), {workspaces: []});
    return {workspaces: Array.isArray(store.workspaces) ? store.workspaces : []};
  }

  private async saveStore(store: WorkspaceStore): Promise<void> {
    await ensureDirectory(getWorkspacesDir(this.cwd));
    await writeJsonFile(getStorePath(this.cwd), store);
  }

  async createWorkspace(input: {
    agentName: string;
    mode: SubagentWorkspaceMode;
    teamRunId: string;
  }): Promise<SubagentWorkspace> {
    const workspaceId = `${input.teamRunId}-${input.agentName}-${Date.now()}`;
    let workspace: SubagentWorkspace;
    if (input.mode === 'main') {
      workspace = {
        agentName: input.agentName,
        cleanup: false,
        createdAt: new Date().toISOString(),
        mainRoot: this.cwd,
        mode: 'main',
        status: 'active',
        teamRunId: input.teamRunId,
        workspaceId,
        workspaceRoot: this.cwd,
      };
    } else if (input.mode === 'git-worktree') {
      workspace = await createGitWorktreeWorkspace({
        agentName: input.agentName,
        mainRoot: this.cwd,
        teamRunId: input.teamRunId,
        workspaceId,
      });
    } else {
      workspace = await createTempWorkspace({
        agentName: input.agentName,
        mainRoot: this.cwd,
        teamRunId: input.teamRunId,
        workspaceId,
      });
    }
    workspace = {
      ...workspace,
      baseSnapshot: await collectWorkspaceSnapshot(workspace.mainRoot),
    };
    const store = await this.loadStore();
    await this.saveStore({workspaces: [...store.workspaces, workspace]});
    return workspace;
  }

  async listWorkspaces(): Promise<SubagentWorkspace[]> {
    return (await this.loadStore()).workspaces;
  }

  async findWorkspace(workspaceId: string): Promise<SubagentWorkspace | null> {
    return (await this.listWorkspaces()).find((workspace) => workspace.workspaceId === workspaceId) ?? null;
  }

  async findByTeamRun(teamRunId: string): Promise<SubagentWorkspace[]> {
    return (await this.listWorkspaces()).filter((workspace) => workspace.teamRunId === teamRunId);
  }

  async collectDiff(workspace: SubagentWorkspace): Promise<WorkspaceDiff> {
    return collectWorkspaceDiff(workspace);
  }

  async createMergePlan(teamRunId: string): Promise<MergePlan[]> {
    const workspaces = await this.findByTeamRun(teamRunId);
    const plans: MergePlan[] = [];
    for (const workspace of workspaces) {
      plans.push(await createMergePlan(await this.collectDiff(workspace)));
    }
    return plans;
  }

  async apply(teamRunId: string, filePath?: string): Promise<string[]> {
    const workspaces = await this.findByTeamRun(teamRunId);
    const resolution = await loadResolutionState(this.cwd, teamRunId);
    const manualFiles = new Set(resolution.entries.filter((entry) => entry.action === 'manual').map((entry) => entry.file));
    if (!filePath && manualFiles.size > 0) {
      throw new Error(`Manual merge resolutions block full apply: ${Array.from(manualFiles).join(', ')}`);
    }
    const skippedFiles = new Set(resolution.entries.filter((entry) => entry.action === 'skip').map((entry) => entry.file));
    const applied: string[] = [];
    for (const workspace of workspaces) {
      const diff = await this.collectDiff(workspace);
      const filteredDiff = filePath
        ? {...diff, files: diff.files.filter((file) => file.path === filePath)}
        : {...diff, files: diff.files.filter((file) => !skippedFiles.has(file.path))};
      const plan = await createMergePlan(filteredDiff);
      if (plan.conflicts.length > 0) {
        throw new Error(`Merge conflicts detected: ${plan.conflicts.join(', ')}`);
      }
      applied.push(...await applyMergePlan(filteredDiff, plan));
      if (!filePath) {
        await this.markWorkspace(workspace.workspaceId, 'applied');
      }
    }
    return applied;
  }

  async discard(teamRunId: string): Promise<number> {
    const workspaces = await this.findByTeamRun(teamRunId);
    let count = 0;
    for (const workspace of workspaces) {
      await this.cleanupWorkspace(workspace);
      await this.markWorkspace(workspace.workspaceId, 'discarded');
      count += 1;
    }
    return count;
  }

  async cleanupDiscarded(): Promise<number> {
    const store = await this.loadStore();
    let cleaned = 0;
    for (const workspace of store.workspaces) {
      if (workspace.status === 'discarded' || workspace.status === 'applied') {
        await this.cleanupWorkspace(workspace);
        cleaned += 1;
      }
    }
    await fs.rm(getWorkspacesDir(this.cwd), {force: false, recursive: true}).catch(() => undefined);
    await this.saveStore({workspaces: store.workspaces.filter((workspace) => workspace.status === 'active' || workspace.status === 'planned')});
    return cleaned;
  }

  private async markWorkspace(workspaceId: string, status: SubagentWorkspace['status']): Promise<void> {
    const store = await this.loadStore();
    await this.saveStore({
      workspaces: store.workspaces.map((workspace) => workspace.workspaceId === workspaceId ? {...workspace, status} : workspace),
    });
  }

  private async cleanupWorkspace(workspace: SubagentWorkspace): Promise<void> {
    if (workspace.mode === 'git-worktree') {
      await cleanupGitWorktree(workspace);
      return;
    }
    await cleanupTempWorkspace(workspace);
  }
}
