import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import {execa} from 'execa';

import {runTeamSequential} from '../../src/agents/teamRunner.js';
import {TeamArtifactStore} from '../../src/agents/artifacts/store.js';
import {formatConflictReport} from '../../src/agents/workspace/conflictReport.js';
import {createGitWorktreePlan} from '../../src/agents/workspace/gitWorktree.js';
import {exportTeamPatch, loadResolutionState, setResolution, validateTeamPatch} from '../../src/agents/workspace/resolution.js';
import {SubagentWorkspaceManager} from '../../src/agents/workspace/workspaceManager.js';
import type {ResolvedConfig} from '../../src/config/config.js';
import {createMockConfig} from '../support/mocks.js';

const mockResolvedConfig = (): ResolvedConfig => ({
  effective: createMockConfig(),
  ignorePatterns: [],
  project: {},
  projectMemory: null,
  user: createMockConfig(),
});

const makeProject = async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-workspace-'));
  await fs.mkdir(path.join(cwd, 'src'), {recursive: true});
  await fs.writeFile(path.join(cwd, 'src/example.ts'), 'export const value = 1;\n');
  await fs.writeFile(path.join(cwd, 'README.md'), '# Demo\n');
  return cwd;
};

describe('subagent workspaces', () => {
  it('creates temp-copy workspaces and keeps main workspace unchanged until apply', async () => {
    const cwd = await makeProject();
    const manager = new SubagentWorkspaceManager(cwd);
    const workspace = await manager.createWorkspace({
      agentName: 'coder',
      mode: 'temp-copy',
      teamRunId: 'team-test',
    });

    await fs.writeFile(path.join(workspace.workspaceRoot, 'src/example.ts'), 'export const value = 2;\n');
    expect(await fs.readFile(path.join(cwd, 'src/example.ts'), 'utf8')).toContain('value = 1');

    const diff = await manager.collectDiff(workspace);
    expect(diff.files).toEqual([expect.objectContaining({path: 'src/example.ts', status: 'modified'})]);
    const plan = await manager.createMergePlan('team-test');
    expect(plan[0]?.requiresApproval).toBe(true);

    await manager.apply('team-test');
    expect(await fs.readFile(path.join(cwd, 'src/example.ts'), 'utf8')).toContain('value = 2');
  });

  it('discards temp-copy workspaces and creates safe git worktree command plans', async () => {
    const cwd = await makeProject();
    const manager = new SubagentWorkspaceManager(cwd);
    const workspace = await manager.createWorkspace({
      agentName: 'reviewer',
      mode: 'temp-copy',
      teamRunId: 'team-discard',
    });
    await manager.discard('team-discard');
    await expect(fs.access(workspace.workspaceRoot)).rejects.toThrow();

    const plan = createGitWorktreePlan({
      agentName: 'coder',
      mainRoot: cwd,
      teamRunId: 'team-git',
      workspaceId: 'workspace-1',
    });
    expect(plan.addArgs).toEqual(['worktree', 'add', '--detach', expect.stringContaining('workspace-1'), 'HEAD']);
    expect(plan.removeArgs).toEqual(['worktree', 'remove', '--force', expect.stringContaining('workspace-1')]);
  });

  it('detects main-workspace changes as merge conflicts', async () => {
    const cwd = await makeProject();
    const manager = new SubagentWorkspaceManager(cwd);
    const workspace = await manager.createWorkspace({
      agentName: 'coder',
      mode: 'temp-copy',
      teamRunId: 'team-conflict',
    });
    await fs.writeFile(path.join(workspace.workspaceRoot, 'src/example.ts'), 'export const value = 2;\n');
    await fs.writeFile(path.join(cwd, 'src/example.ts'), 'export const value = 3;\n');

    const plan = await manager.createMergePlan('team-conflict');
    expect(plan[0]?.conflictDetails?.[0]?.type).toBe('same-line');
    expect(formatConflictReport(plan)).toContain('same-line');
    await expect(manager.apply('team-conflict')).rejects.toThrow(/Merge conflicts/u);
  });

  it('detects and applies clean file renames from isolated workspaces', async () => {
    const cwd = await makeProject();
    const manager = new SubagentWorkspaceManager(cwd);
    const workspace = await manager.createWorkspace({
      agentName: 'coder',
      mode: 'temp-copy',
      teamRunId: 'team-rename',
    });

    await fs.rename(
      path.join(workspace.workspaceRoot, 'src/example.ts'),
      path.join(workspace.workspaceRoot, 'src/renamed.ts'),
    );

    const plan = await manager.createMergePlan('team-rename');
    const firstPlan = plan[0];
    expect(firstPlan).toBeDefined();
    if (!firstPlan) {
      throw new Error('expected merge plan');
    }
    expect(firstPlan.renames?.[0]).toEqual(expect.objectContaining({
      newPath: 'src/renamed.ts',
      oldPath: 'src/example.ts',
    }));
    expect(firstPlan.cleanFiles?.at(0)).toEqual(expect.objectContaining({status: 'renamed'}));

    const applied = await manager.apply('team-rename');
    expect(applied).toContain('src/example.ts -> src/renamed.ts');
    await expect(fs.access(path.join(cwd, 'src/example.ts'))).rejects.toThrow();
    await expect(fs.access(path.join(cwd, 'src/renamed.ts'))).resolves.toBeUndefined();
  });

  it('reports rename conflicts when main changed the old path or target path', async () => {
    const cwd = await makeProject();
    const manager = new SubagentWorkspaceManager(cwd);
    const sourceChanged = await manager.createWorkspace({
      agentName: 'coder',
      mode: 'temp-copy',
      teamRunId: 'team-rename-source',
    });
    await fs.rename(
      path.join(sourceChanged.workspaceRoot, 'src/example.ts'),
      path.join(sourceChanged.workspaceRoot, 'src/renamed.ts'),
    );
    await fs.writeFile(path.join(cwd, 'src/example.ts'), 'export const value = 42;\n');

    const sourcePlan = await manager.createMergePlan('team-rename-source');
    expect(sourcePlan[0]?.renameConflicts?.[0]?.type).toBe('rename-source-changed');

    const targetCwd = await makeProject();
    const targetManager = new SubagentWorkspaceManager(targetCwd);
    const targetChanged = await targetManager.createWorkspace({
      agentName: 'coder',
      mode: 'temp-copy',
      teamRunId: 'team-rename-target',
    });
    await fs.rename(
      path.join(targetChanged.workspaceRoot, 'src/example.ts'),
      path.join(targetChanged.workspaceRoot, 'src/renamed.ts'),
    );
    await fs.writeFile(path.join(targetCwd, 'src/renamed.ts'), 'export const existing = true;\n');

    const targetPlan = await targetManager.createMergePlan('team-rename-target');
    expect(targetPlan[0]?.renameConflicts?.[0]?.type).toBe('rename-target');
    await expect(targetManager.apply('team-rename-target')).rejects.toThrow(/Merge conflicts/u);
  });

  it('respects workspace ignore rules and records ignored files', async () => {
    const cwd = await makeProject();
    await fs.writeFile(path.join(cwd, '.opencodeignore'), 'home/\n*.tmp\n');
    const manager = new SubagentWorkspaceManager(cwd);
    const workspace = await manager.createWorkspace({
      agentName: 'tester',
      mode: 'temp-copy',
      teamRunId: 'team-ignore',
    });
    await fs.mkdir(path.join(workspace.workspaceRoot, 'home/.npm'), {recursive: true});
    await fs.writeFile(path.join(workspace.workspaceRoot, 'home/.npm/cache.log'), 'noise\n');
    await fs.writeFile(path.join(workspace.workspaceRoot, 'scratch.tmp'), 'noise\n');
    await fs.writeFile(path.join(workspace.workspaceRoot, 'src/example.ts'), 'export const value = 5;\n');

    const diff = await manager.collectDiff(workspace);
    expect(diff.files.map((file) => file.path)).toEqual(['src/example.ts']);
    expect(diff.ignoredFiles?.map((file) => file.path)).toEqual(expect.arrayContaining(['home/.npm/cache.log', 'scratch.tmp']));
    expect((await manager.createMergePlan('team-ignore'))[0]?.ignoredFiles?.length).toBeGreaterThan(0);
  });

  it('persists merge resolution state and exports a patch artifact', async () => {
    const cwd = await makeProject();
    const manager = new SubagentWorkspaceManager(cwd);
    const workspace = await manager.createWorkspace({
      agentName: 'coder',
      mode: 'temp-copy',
      teamRunId: 'team-resolve',
    });
    await fs.writeFile(path.join(workspace.workspaceRoot, 'src/example.ts'), 'export const value = 6;\n');

    await setResolution(cwd, 'team-resolve', 'src/example.ts', 'skip');
    expect((await loadResolutionState(cwd, 'team-resolve')).entries[0]).toEqual(expect.objectContaining({
      action: 'skip',
      file: 'src/example.ts',
    }));
    const patchPath = await exportTeamPatch(cwd, 'team-resolve');
    await expect(fs.access(patchPath)).resolves.toBeUndefined();
    await manager.apply('team-resolve');
    expect(await fs.readFile(path.join(cwd, 'src/example.ts'), 'utf8')).toContain('value = 1');
  });

  it('exports git-apply-compatible patches with sidecar validation metadata', async () => {
    const cwd = await makeProject();
    await execa('git', ['init'], {cwd});
    await execa('git', ['config', 'user.email', 'opencode@example.test'], {cwd});
    await execa('git', ['config', 'user.name', 'OpenCode Test'], {cwd});
    await execa('git', ['add', '.'], {cwd});
    await execa('git', ['commit', '-m', 'initial'], {cwd});

    const manager = new SubagentWorkspaceManager(cwd);
    const workspace = await manager.createWorkspace({
      agentName: 'coder',
      mode: 'temp-copy',
      teamRunId: 'team-patch',
    });
    await fs.writeFile(path.join(workspace.workspaceRoot, 'src/example.ts'), 'export const value = 9;\n');
    await fs.writeFile(path.join(workspace.workspaceRoot, 'src/added.ts'), 'export const added = true;\n');
    await fs.rm(path.join(workspace.workspaceRoot, 'README.md'));

    const patchPath = await exportTeamPatch(cwd, 'team-patch');
    const patch = await fs.readFile(patchPath, 'utf8');
    expect(patch).toContain('diff --git a/README.md b/README.md');
    expect(patch).toContain('diff --git a/src/added.ts b/src/added.ts');
    expect(patch).toContain('diff --git a/src/example.ts b/src/example.ts');
    expect(patch).not.toContain('a/a/');
    expect(patch).not.toContain('b/b/');

    const validation = await validateTeamPatch(cwd, 'team-patch', patchPath);
    expect(validation.ok).toBe(true);
    expect(validation.skippedGitCheck).toBe(false);
    const sidecar = JSON.parse(await fs.readFile(`${patchPath}.json`, 'utf8')) as {files: string[]; validated: boolean; validationResult: {ok: boolean}};
    expect(sidecar.files).toEqual(expect.arrayContaining(['README.md', 'src/added.ts', 'src/example.ts']));
    expect(sidecar.validated).toBe(true);
    expect(sidecar.validationResult.ok).toBe(true);
  });

  it('excludes skipped files from exported patches', async () => {
    const cwd = await makeProject();
    const manager = new SubagentWorkspaceManager(cwd);
    const workspace = await manager.createWorkspace({
      agentName: 'coder',
      mode: 'temp-copy',
      teamRunId: 'team-patch-skip',
    });
    await fs.writeFile(path.join(workspace.workspaceRoot, 'src/example.ts'), 'export const value = 10;\n');
    await setResolution(cwd, 'team-patch-skip', 'src/example.ts', 'skip');

    const patchPath = await exportTeamPatch(cwd, 'team-patch-skip');
    expect(await fs.readFile(patchPath, 'utf8')).not.toContain('src/example.ts');
    const validation = await validateTeamPatch(cwd, 'team-patch-skip', patchPath);
    expect(validation.skippedGitCheck).toBe(true);
  });

  it('creates and cleans real git worktree workspaces in temp repos', async () => {
    const cwd = await makeProject();
    await execa('git', ['init'], {cwd});
    await execa('git', ['config', 'user.email', 'opencode@example.test'], {cwd});
    await execa('git', ['config', 'user.name', 'OpenCode Test'], {cwd});
    await execa('git', ['add', '.'], {cwd});
    await execa('git', ['commit', '-m', 'initial'], {cwd});

    const manager = new SubagentWorkspaceManager(cwd);
    const workspace = await manager.createWorkspace({
      agentName: 'planner',
      mode: 'git-worktree',
      teamRunId: 'team-worktree',
    });

    expect(workspace.mode).toBe('git-worktree');
    expect(workspace.status).toBe('active');
    expect(workspace.workspaceRoot).toContain(path.join('.apeironcode-agent', 'worktrees'));
    await expect(fs.access(path.join(workspace.workspaceRoot, 'README.md'))).resolves.toBeUndefined();

    await manager.discard('team-worktree');
    await expect(fs.access(workspace.workspaceRoot)).rejects.toThrow();
  });

  it('runs a mock-provider team in real git worktree mode', async () => {
    const cwd = await makeProject();
    await execa('git', ['init'], {cwd});
    await execa('git', ['config', 'user.email', 'opencode@example.test'], {cwd});
    await execa('git', ['config', 'user.name', 'OpenCode Test'], {cwd});
    await execa('git', ['add', '.'], {cwd});
    await execa('git', ['commit', '-m', 'initial'], {cwd});

    const result = await runTeamSequential('explain repo', {
      config: mockResolvedConfig(),
      cwd,
      workspaceMode: 'git-worktree',
    });

    expect(result.workspaceMode).toBe('git-worktree');
    expect(result.results[0]?.workspaceRoot).toContain(path.join('.apeironcode-agent', 'worktrees'));
    const runs = await new TeamArtifactStore(cwd).listRuns();
    expect(runs[0]?.artifacts.some((artifact) => artifact.kind === 'summary')).toBe(true);
    await new SubagentWorkspaceManager(cwd).discard(result.teamRunId);
  });
});
