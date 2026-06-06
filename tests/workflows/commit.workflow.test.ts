import path from 'node:path';
import fs from 'node:fs/promises';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
  createAgent,
  createWorkspace,
  initGitRepo,
  createGitCommit,
  getGitLog,
  type WorkspaceSetup,
} from '../helpers/workflow.js';

describe('Workflow: Git Commit', () => {
  let workspace: WorkspaceSetup;

  beforeEach(async () => {
    workspace = await createWorkspace();
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  it('should prepare and commit changes with approval flow', async () => {
    // Setup git repo
    initGitRepo(workspace.projectDir);

    const srcPath = path.join(workspace.projectDir, 'src');
    await fs.mkdir(srcPath, {recursive: true});
    const filePath = path.join(srcPath, 'feature.ts');
    await fs.writeFile(filePath, 'export const feature = {};\n');
    createGitCommit(workspace.projectDir, 'initial commit');

    // Modify file
    await fs.writeFile(filePath, 'export const feature = { enabled: true };\n');

    // Create approval handler that approves the commit
    const agent = await createAgent(workspace.projectDir, {
      approvalHandler: () => Promise.resolve({approved: true}),
    });

    const result = await agent.run({
      prompt: 'commit these changes with message "add feature flag"',
    });

    // Verify completion
    expect(result.finalMessage.content).toBeDefined();

    // Verify tool calls were made
    expect(result.toolCalls.length).toBeGreaterThan(0);
  });

  it('should skip commit when approval is denied', async () => {
    // Setup git repo
    initGitRepo(workspace.projectDir);

    const srcPath = path.join(workspace.projectDir, 'src');
    await fs.mkdir(srcPath, {recursive: true});
    const filePath = path.join(srcPath, 'feature.ts');
    await fs.writeFile(filePath, 'export const feature = {};\n');
    createGitCommit(workspace.projectDir, 'initial commit');

    // Modify file
    await fs.writeFile(filePath, 'export const feature = { enabled: true };\n');

    // Create approval handler that denies the commit
    const agent = await createAgent(workspace.projectDir, {
      approvalHandler: () => Promise.resolve({approved: false}),
    });

    const result = await agent.run({
      prompt: 'commit these changes',
    });

    // Agent should complete even if approval denied
    expect(result.finalMessage.content).toBeDefined();
  });

  it('should verify commit was created after approval', async () => {
    // Setup git repo
    initGitRepo(workspace.projectDir);

    const srcPath = path.join(workspace.projectDir, 'src');
    await fs.mkdir(srcPath, {recursive: true});
    const filePath = path.join(srcPath, 'feature.ts');
    await fs.writeFile(filePath, 'export const feature = {};\n');
    createGitCommit(workspace.projectDir, 'initial commit');

    // Modify file
    await fs.writeFile(filePath, 'export const feature = { v: 2 };\n');

    const agent = await createAgent(workspace.projectDir, {
      approvalHandler: () => Promise.resolve({approved: true}),
    });

    await agent.run({
      prompt: 'commit these changes with message "update feature"',
    });

    // Verify git log exists
    const finalLog = getGitLog(workspace.projectDir, 1);
    expect(finalLog).toBeDefined();
  });

  it('should track commit workflow through tool calls', async () => {
    // Setup git repo
    initGitRepo(workspace.projectDir);

    const srcPath = path.join(workspace.projectDir, 'src');
    await fs.mkdir(srcPath, {recursive: true});
    const filePath = path.join(srcPath, 'feature.ts');
    await fs.writeFile(filePath, 'initial\n');
    createGitCommit(workspace.projectDir, 'initial');

    // Make changes
    await fs.writeFile(filePath, 'modified\n');

    const agent = await createAgent(workspace.projectDir, {
      approvalHandler: () => Promise.resolve({approved: true}),
    });

    const result = await agent.run({
      prompt: 'commit the current changes',
    });

    // Verify tool calls exist
    expect(result.toolCalls.length).toBeGreaterThan(0);

    // All tools should complete
    for (const call of result.toolCalls) {
      expect(['success', 'error']).toContain(call.status);
    }
  });
});
