import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {DEFAULT_CONFIG} from '../../src/config/defaults.js';
import {createTaskState} from '../../src/core/agent/state.js';
import {ApprovalManager} from '../../src/safety/approvals.js';
import {createDefaultToolRegistry} from '../../src/tools/registry.js';

describe('patch engine integration', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-patch-'));
    await fs.mkdir(path.join(projectDir, 'src'), {recursive: true});
    await fs.writeFile(path.join(projectDir, 'src', 'example.ts'), 'export const value = 1;\n', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(projectDir, {force: true, recursive: true});
  });

  const createContext = () => ({
    approvalManager: new ApprovalManager('bypass'),
    config: DEFAULT_CONFIG,
    cwd: projectDir,
    taskState: createTaskState('test patch engine', 'edit' as const),
  });

  it('applies search_replace edits and returns edit metadata', async () => {
    const registry = createDefaultToolRegistry();
    const result = await registry.invoke('edit_file', {
      path: 'src/example.ts',
      replace: 'export const value = 2;',
      search: 'export const value = 1;',
    }, createContext());

    expect(await fs.readFile(path.join(projectDir, 'src', 'example.ts'), 'utf8')).toContain('value = 2');
    expect(result.metadata?.editId).toBeDefined();
    expect(result.diff).toContain('+export const value = 2;');
  });

  it('fails on ambiguous search strings', async () => {
    await fs.writeFile(path.join(projectDir, 'src', 'example.ts'), 'const value = 1;\nconst value = 1;\n', 'utf8');
    const registry = createDefaultToolRegistry();

    await expect(registry.invoke('edit_file', {
      path: 'src/example.ts',
      replace: 'const value = 2;',
      search: 'const value = 1;',
    }, createContext())).rejects.toMatchObject({
      code: 'PATCH_MATCH_AMBIGUOUS',
    });
  });

  it('records edit history for created files', async () => {
    const registry = createDefaultToolRegistry();
    const result = await registry.invoke('patch_file', {
      operations: [{content: 'hello\n', type: 'create_file'}],
      path: 'src/new-file.ts',
    }, createContext());

    const historyPath = path.join(projectDir, '.apeironcode-agent', 'history', 'edits.jsonl');
    const history = await fs.readFile(historyPath, 'utf8');
    expect(history).toContain('create_file');
    expect(result.metadata?.editId).toBeDefined();
  });

  it('records backups for full rewrites', async () => {
    const registry = createDefaultToolRegistry();
    const result = await registry.invoke('write_file', {
      content: 'export const value = 3;\n',
      path: 'src/example.ts',
    }, createContext());

    const backupPath = result.metadata?.backupPath;
    expect(typeof backupPath).toBe('string');
    const backupContent = await fs.readFile(path.join(projectDir, String(backupPath)), 'utf8');
    expect(backupContent).toContain('value = 1');
  });

  it('reverts the last edit back to the previous file content', async () => {
    const registry = createDefaultToolRegistry();
    const revertContext = {
      approvalManager: new ApprovalManager('ask', () => Promise.resolve({approved: true})),
      config: DEFAULT_CONFIG,
      cwd: projectDir,
    };
    await registry.invoke('write_file', {
      content: 'export const value = 4;\n',
      path: 'src/example.ts',
    }, createContext());

    await registry.invoke('revert_patch', {target: 'last'}, revertContext);
    const restored = await fs.readFile(path.join(projectDir, 'src', 'example.ts'), 'utf8');
    expect(restored).toContain('value = 1');
  });

  it('reverts from reverse diff when the backup file is missing', async () => {
    const registry = createDefaultToolRegistry();
    const revertContext = {
      approvalManager: new ApprovalManager('ask', () => Promise.resolve({approved: true})),
      config: DEFAULT_CONFIG,
      cwd: projectDir,
    };
    const result = await registry.invoke('write_file', {
      content: 'export const value = 5;\n',
      path: 'src/example.ts',
    }, createContext());

    await fs.rm(path.join(projectDir, String(result.metadata?.backupPath)), {force: true});

    const revertResult = await registry.invoke('revert_patch', {target: 'last'}, revertContext);
    const restored = await fs.readFile(path.join(projectDir, 'src', 'example.ts'), 'utf8');

    expect(restored).toContain('value = 1');
    expect(revertResult.metadata?.revertMethod).toBe('reverse-diff');
  });

  it('reconstructs deleted files via reverse diff when the backup file is missing', async () => {
    const registry = createDefaultToolRegistry();
    const deleteContext = {
      approvalManager: new ApprovalManager('ask', () => Promise.resolve({approved: true})),
      config: DEFAULT_CONFIG,
      cwd: projectDir,
      taskState: createTaskState('test patch engine', 'edit' as const),
    };
    const revertContext = {
      approvalManager: new ApprovalManager('ask', () => Promise.resolve({approved: true})),
      config: DEFAULT_CONFIG,
      cwd: projectDir,
    };
    const result = await registry.invoke('patch_file', {
      operations: [{type: 'delete_file'}],
      path: 'src/example.ts',
    }, deleteContext);

    await fs.rm(path.join(projectDir, String(result.metadata?.backupPath)), {force: true});

    const revertResult = await registry.invoke('revert_patch', {target: 'last'}, revertContext);
    const restored = await fs.readFile(path.join(projectDir, 'src', 'example.ts'), 'utf8');

    expect(restored).toContain('value = 1');
    expect(revertResult.metadata?.revertMethod).toBe('reverse-diff');
  });

  it('blocks delete_file when approval is denied', async () => {
    const registry = createDefaultToolRegistry();
    const deniedContext = {
      approvalManager: new ApprovalManager('ask', () => Promise.resolve({approved: false})),
      config: DEFAULT_CONFIG,
      cwd: projectDir,
    };

    await expect(registry.invoke('patch_file', {
      operations: [{type: 'delete_file'}],
      path: 'src/example.ts',
    }, deniedContext)).rejects.toMatchObject({
      code: 'APPROVAL_DENIED',
    });
    await expect(fs.stat(path.join(projectDir, 'src', 'example.ts'))).resolves.toBeDefined();
  });
});
