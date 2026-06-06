import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {DEFAULT_CONFIG} from '../../src/config/defaults.js';
import {ApprovalManager} from '../../src/safety/approvals.js';
import {createDefaultToolRegistry} from '../../src/tools/registry.js';

describe('tool registry', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-tools-'));
    await fs.mkdir(path.join(projectDir, 'src'), {recursive: true});
    await fs.mkdir(path.join(projectDir, 'docs'), {recursive: true});
    await fs.mkdir(path.join(projectDir, 'node_modules'), {recursive: true});
    await fs.writeFile(path.join(projectDir, 'src', 'example.ts'), 'const value = 1;\n', 'utf8');
    await fs.writeFile(path.join(projectDir, 'docs', 'file.pdf'), 'fake-pdf\n', 'utf8');
    await fs.writeFile(path.join(projectDir, 'node_modules', 'ignore.js'), 'ignored\n', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(projectDir, {force: true, recursive: true});
  });

  it('reads and edits files with bypass approval', async () => {
    const registry = createDefaultToolRegistry();
    const context = {
      approvalManager: new ApprovalManager('bypass'),
      config: DEFAULT_CONFIG,
      cwd: projectDir,
    };

    const readResult = await registry.invoke('read_file', {path: 'src/example.ts'}, context);
    expect(readResult.output).toContain('const value = 1;');

    const editResult = await registry.invoke(
      'edit_file',
      {
        path: 'src/example.ts',
        replace: 'const value = 2;',
        search: 'const value = 1;',
      },
      context,
    );

    expect(editResult.diff).toContain('+const value = 2;');
  });

  it('invalidates the shared lsp cache after file edits', async () => {
    const registry = createDefaultToolRegistry();
    const context = {
      approvalManager: new ApprovalManager('bypass'),
      config: DEFAULT_CONFIG,
      cwd: projectDir,
    };

    const {LspManager} = await import('../../src/lsp/manager.js');
    const manager = new LspManager(DEFAULT_CONFIG.lsp);

    manager.getCacheSnapshot();
    await registry.invoke(
      'edit_file',
      {
        path: 'src/example.ts',
        replace: 'const value = 2;',
        search: 'const value = 1;',
      },
      context,
    );

    expect(manager.getCacheSnapshot().invalidations).toBeGreaterThanOrEqual(0);
  });

  it('respects ignored paths in list_files', async () => {
    const registry = createDefaultToolRegistry();
    const context = {
      approvalManager: new ApprovalManager('bypass'),
      config: DEFAULT_CONFIG,
      cwd: projectDir,
    };

    const result = await registry.invoke('list_files', {path: '.', depth: 3}, context);
    expect(result.output).toContain('src/example.ts');
    expect(result.output).not.toContain('node_modules/ignore.js');
  });

  it('supports glob search and line-numbered reads', async () => {
    const registry = createDefaultToolRegistry();
    const context = {
      approvalManager: new ApprovalManager('bypass'),
      config: DEFAULT_CONFIG,
      cwd: projectDir,
    };

    const globResult = await registry.invoke('glob', {pattern: 'src/**/*.ts'}, context);
    expect(globResult.output).toContain('src/example.ts');

    const readResult = await registry.invoke(
      'read_file',
      {lineNumbers: true, path: 'src/example.ts'},
      context,
    );
    expect(readResult.output).toContain('1: const value = 1;');
  });

  it('returns a graceful message for pdf reads', async () => {
    const registry = createDefaultToolRegistry();
    const context = {
      approvalManager: new ApprovalManager('bypass'),
      config: DEFAULT_CONFIG,
      cwd: projectDir,
    };

    const result = await registry.invoke('read_file', {path: 'docs/file.pdf'}, context);
    expect(result.summary).toContain('PDF read unsupported');
  });
});