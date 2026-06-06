import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {detectSimpleAction} from '../../src/agent/simpleActionRouter.js';
import {
  canExecuteSimpleActionDirectly,
  executeSimpleAction,
  formatSimpleActionExecutionResult,
} from '../../src/agent/simpleActionExecutor.js';
import {ToolRegistry} from '../../src/tools/registry.js';
import {ApprovalManager} from '../../src/safety/approvals.js';
import {AuditLog} from '../../src/safety/auditLog.js';
import {writeFileTool} from '../../src/tools/writeFile.js';
import {readFileTool} from '../../src/tools/readFile.js';
import {projectTreeTool} from '../../src/tools/projectTree.js';
import {runCommandTool} from '../../src/tools/runCommand.js';
import {createMockConfig} from '../support/mocks.js';

const makeRegistry = (approval: ApprovalManager) => {
  const registry = new ToolRegistry([writeFileTool, readFileTool, projectTreeTool, runCommandTool]);
  registry.configureExecutor({
    approvalManager: approval,
    globalPermissionRules: [],
    auditLog: new AuditLog(),
    sessionId: 'exec-test',
  });
  return registry;
};

describe('simpleActionExecutor', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'exec-'));
  });
  afterEach(async () => {
    await fs.rm(cwd, {force: true, recursive: true});
  });

  const ctx = (approval: ApprovalManager) => ({
    approvalManager: approval,
    config: createMockConfig(),
    cwd,
  });

  it('canExecuteSimpleActionDirectly is true for create/rename/tree/run', () => {
    expect(canExecuteSimpleActionDirectly(detectSimpleAction('create a file named a.md')!)).toBe(true);
    expect(canExecuteSimpleActionDirectly(detectSimpleAction('show project tree')!)).toBe(true);
  });

  it('read_file is direct-executable (Phase 17E) and produces deterministic read', async () => {
    // Bare "read <file>" must not be left on the generic loop where the
    // model could emit read_file with a missing path. The runtime owns it.
    const action = detectSimpleAction('read package.json');
    expect(action).not.toBeNull();
    expect(action?.kind).toBe('read_file');
    expect(action?.path).toBe('package.json');
    expect(canExecuteSimpleActionDirectly(action!)).toBe(true);

    await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"x"}');
    const approval = new ApprovalManager('bypass');
    const registry = makeRegistry(approval);
    const result = await executeSimpleAction(action!, ctx(approval), registry);
    expect(result.ok).toBe(true);
    expect(result.providerCalls).toBe(0);
    expect(result.output ?? '').toContain('"name":"x"');
    expect(result.tools.some((t) => t.toolName === 'read_file' && t.input.path === 'package.json')).toBe(true);
  });

  it('create_file asks approval, then writes valid args', async () => {
    const seen: string[] = [];
    const approval = new ApprovalManager('ask', (r) => {
      seen.push(r.title);
      return Promise.resolve({approved: true});
    });
    const action = detectSimpleAction('create a file named hello.md in the root')!;
    const result = await executeSimpleAction(action, ctx(approval), makeRegistry(approval));
    expect(result.ok).toBe(true);
    expect(result.filesChanged).toEqual(['hello.md']);
    expect(result.providerCalls).toBe(0);
    expect(seen.some((t) => t.includes('write_file'))).toBe(true);
    expect(await fs.readFile(path.join(cwd, 'hello.md'), 'utf8')).toBe('');
  });

  it('denied approval writes nothing', async () => {
    const approval = new ApprovalManager('ask', () => Promise.resolve({approved: false}));
    const action = detectSimpleAction('create a file named hello.md in the root')!;
    const result = await executeSimpleAction(action, ctx(approval), makeRegistry(approval));
    expect(result.ok).toBe(false);
    await expect(fs.stat(path.join(cwd, 'hello.md'))).rejects.toThrow();
  });

  it('existing target is not overwritten', async () => {
    await fs.writeFile(path.join(cwd, 'hello.md'), 'keep me');
    const approval = new ApprovalManager('ask', () => Promise.resolve({approved: true}));
    const action = detectSimpleAction('create a file named hello.md in the root')!;
    const result = await executeSimpleAction(action, ctx(approval), makeRegistry(approval));
    expect(result.ok).toBe(false);
    expect(result.unsupportedReason).toBe('target-exists');
    expect(await fs.readFile(path.join(cwd, 'hello.md'), 'utf8')).toBe('keep me');
  });

  it('approved static_web_app writes three files with one scaffold approval and valid write_file args', async () => {
    const prompts: string[] = [];
    const approval = new ApprovalManager('ask', (request) => {
      prompts.push(request.title);
      return Promise.resolve({approved: true});
    });
    const action = detectSimpleAction('Create a simple modern web app in this folder using plain HTML, CSS, and JavaScript')!;
    const registry = makeRegistry(approval);
    const result = await executeSimpleAction(action, ctx(approval), registry);
    expect(result.ok).toBe(true);
    expect(result.filesChanged).toEqual(['index.html', 'styles.css', 'app.js']);
    expect(result.providerCalls).toBe(0);
    expect(prompts).toEqual(['Create static web app']);
    expect(result.tools).toHaveLength(3);
    for (const tool of result.tools) {
      expect(tool.toolName).toBe('write_file');
      expect(typeof tool.input.path).toBe('string');
      expect(typeof tool.input.content).toBe('string');
    }
    await expect(fs.stat(path.join(cwd, 'index.html'))).resolves.toBeDefined();
    await expect(fs.stat(path.join(cwd, 'styles.css'))).resolves.toBeDefined();
    await expect(fs.stat(path.join(cwd, 'app.js'))).resolves.toBeDefined();
  });

  it('denied static_web_app writes nothing', async () => {
    const approval = new ApprovalManager('ask', () => Promise.resolve({approved: false}));
    const result = await executeSimpleAction(
      detectSimpleAction('create a simple modern web app with html css js')!,
      ctx(approval),
      makeRegistry(approval),
    );
    expect(result.ok).toBe(false);
    await expect(fs.stat(path.join(cwd, 'index.html'))).rejects.toThrow();
  });

  it('existing static_web_app file blocks overwrite before approval', async () => {
    await fs.writeFile(path.join(cwd, 'index.html'), 'keep me');
    let asked = false;
    const approval = new ApprovalManager('ask', () => {
      asked = true;
      return Promise.resolve({approved: true});
    });
    const result = await executeSimpleAction(
      detectSimpleAction('make a simple static website')!,
      ctx(approval),
      makeRegistry(approval),
    );
    expect(result.ok).toBe(false);
    expect(result.unsupportedReason).toBe('target-exists');
    expect(asked).toBe(false);
    expect(await fs.readFile(path.join(cwd, 'index.html'), 'utf8')).toBe('keep me');
  });

  it('static_web_app success summary is concise', () => {
    const text = formatSimpleActionExecutionResult({
      ok: true,
      summary: 'Created a static web app:\n- index.html\n- styles.css\n- app.js\n\nOpen it with:\n`open index.html`',
      filesChanged: ['index.html', 'styles.css', 'app.js'],
      commandsRun: [],
      providerCalls: 0,
      tools: [],
    });
    expect(text).toContain('open index.html');
    expect(text).not.toContain('Provider calls');
    expect(text).not.toContain('memory');
  });

  it('rename asks approval then renames; missing source and existing target are safe', async () => {
    await fs.writeFile(path.join(cwd, 'README.md'), '# readme');
    const approval = new ApprovalManager('ask', () => Promise.resolve({approved: true}));
    const action = detectSimpleAction('rename README.md to read.md')!;
    const result = await executeSimpleAction(action, ctx(approval), makeRegistry(approval));
    expect(result.ok).toBe(true);
    expect(await fs.readFile(path.join(cwd, 'read.md'), 'utf8')).toBe('# readme');
    await expect(fs.stat(path.join(cwd, 'README.md'))).rejects.toThrow();

    const missing = await executeSimpleAction(
      detectSimpleAction('rename nope.md to x.md')!,
      ctx(approval),
      makeRegistry(approval),
    );
    expect(missing.unsupportedReason).toBe('source-missing');
  });

  it('project_tree runs with no approval and {} input', async () => {
    await fs.writeFile(path.join(cwd, 'a.txt'), 'x');
    let asked = false;
    const approval = new ApprovalManager('ask', () => {
      asked = true;
      return Promise.resolve({approved: false});
    });
    const result = await executeSimpleAction(detectSimpleAction('show project tree')!, ctx(approval), makeRegistry(approval));
    expect(result.ok).toBe(true);
    expect(asked).toBe(false);
    expect(result.providerCalls).toBe(0);
  });

  it('run_command requires approval', async () => {
    const seen: string[] = [];
    const approval = new ApprovalManager('ask', (r) => {
      seen.push(r.title + (r.message ?? ''));
      return Promise.resolve({approved: false});
    });
    const result = await executeSimpleAction(detectSimpleAction('run npm test')!, ctx(approval), makeRegistry(approval));
    expect(result.ok).toBe(false);
    expect(seen.length).toBeGreaterThan(0);
  });

  it('formatSimpleActionExecutionResult is concise and states no provider calls', () => {
    const text = formatSimpleActionExecutionResult({
      ok: true, summary: 'Created hello.md in the project root.',
      filesChanged: ['hello.md'], commandsRun: [], providerCalls: 0, tools: [],
    });
    expect(text).toContain('Created hello.md');
    expect(text).toContain('Provider calls: none');
    expect(text).not.toContain('src/agent');
  });
});
