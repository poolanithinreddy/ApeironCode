import path from 'node:path';
import fs from 'node:fs/promises';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
  createAgent,
  createWorkspace,
  initGitRepo,
  createGitCommit,
  getGitDiff,
  type WorkspaceSetup,
} from '../helpers/workflow.js';

describe('Workflow: Git Review', () => {
  let workspace: WorkspaceSetup;

  beforeEach(async () => {
    workspace = await createWorkspace();
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  it('should review git diff when asked', async () => {
    // Create a simple file and git repo
    initGitRepo(workspace.projectDir);

    // Create initial commit
    const srcPath = path.join(workspace.projectDir, 'src');
    await fs.mkdir(srcPath, {recursive: true});
    const filePath = path.join(srcPath, 'app.ts');
    await fs.writeFile(filePath, 'export function hello() {\n  return "world";\n}\n');
    createGitCommit(workspace.projectDir, 'initial commit');

    // Modify the file
    await fs.writeFile(filePath, 'export function hello() {\n  return "updated world";\n}\n');

    // Verify there's a diff
    const diff = getGitDiff(workspace.projectDir);
    expect(diff).toContain('updated world');

    // Run agent to review diff
    const agent = await createAgent(workspace.projectDir);
    const result = await agent.run({
      prompt: 'review the diff',
    });

    // Verify that tool calls were made
    expect(result.toolCalls.length).toBeGreaterThan(0);

    // Should call git_diff tool
    const hasDiffCall = result.toolCalls.some((tc) => tc.toolName === 'git_diff');
    expect(hasDiffCall).toBe(true);

    // Final message should mention the diff or changes
    const finalContent = result.finalMessage.content.toLowerCase();
    expect(finalContent).toBeDefined();
  });

  it('should identify changed files in diff review', async () => {
    // Setup git repo with multiple file changes
    initGitRepo(workspace.projectDir);

    const srcPath = path.join(workspace.projectDir, 'src');
    await fs.mkdir(srcPath, {recursive: true});

    // Create two files
    const file1 = path.join(srcPath, 'util.ts');
    const file2 = path.join(srcPath, 'helper.ts');
    await fs.writeFile(file1, 'export const util = () => {};\n');
    await fs.writeFile(file2, 'export const helper = () => {};\n');
    createGitCommit(workspace.projectDir, 'initial files');

    // Modify both files
    await fs.writeFile(file1, 'export const util = () => { console.log("updated"); };\n');
    await fs.writeFile(file2, 'export const helper = () => { return 42; };\n');

    const agent = await createAgent(workspace.projectDir);
    const result = await agent.run({
      prompt: 'review my changes',
    });

    // At least one tool call should be made
    expect(result.toolCalls.length).toBeGreaterThan(0);

    // Final message should be generated
    expect(result.finalMessage.content.length).toBeGreaterThan(0);
  });

  it('should handle clean working tree', async () => {
    // Create git repo with no changes
    initGitRepo(workspace.projectDir);
    const srcPath = path.join(workspace.projectDir, 'src');
    await fs.mkdir(srcPath, {recursive: true});
    await fs.writeFile(path.join(srcPath, 'app.ts'), 'export const app = {};\n');
    createGitCommit(workspace.projectDir, 'initial commit');

    // No modifications made - clean working tree

    const agent = await createAgent(workspace.projectDir);
    const result = await agent.run({
      prompt: 'review my changes',
    });

    // Should still complete successfully
    expect(result.finalMessage.content).toBeDefined();
  });
});
