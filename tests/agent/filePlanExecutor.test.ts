import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {executeFilePlan} from '../../src/agent/filePlanExecutor.js';
import type {FilePlan} from '../../src/agent/filePlanProtocol.js';
import {ApprovalManager} from '../../src/safety/approvals.js';
import {AuditLog} from '../../src/safety/auditLog.js';
import {ToolRegistry} from '../../src/tools/registry.js';
import {writeFileTool} from '../../src/tools/writeFile.js';
import {runCommandTool} from '../../src/tools/runCommand.js';
import {createMockConfig} from '../support/mocks.js';

describe('filePlanExecutor', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'file-plan-'));
  });

  afterEach(async () => {
    await fs.rm(cwd, {force: true, recursive: true});
  });

  const registry = (approvalManager: ApprovalManager): ToolRegistry => {
    const toolRegistry = new ToolRegistry([writeFileTool, runCommandTool]);
    toolRegistry.configureExecutor({
      approvalManager,
      auditLog: new AuditLog(),
      globalPermissionRules: [],
      sessionId: 'plan',
    });
    return toolRegistry;
  };

  const context = (approvalManager: ApprovalManager) => ({
    approvalManager,
    config: createMockConfig(),
    cwd,
    toolRegistry: registry(approvalManager),
  });

  it('creates multiple files after one file approval', async () => {
    const approvals: string[] = [];
    const approval = new ApprovalManager('ask', (request) => {
      approvals.push(request.title);
      return Promise.resolve({approved: true});
    });
    const plan: FilePlan = {
      commands: [],
      files: [
        {content: 'hello', operation: 'create', path: 'index.html'},
        {content: 'body{}', operation: 'create', path: 'styles.css'},
      ],
      summary: 'Create app',
      validation: [],
    };
    const result = await executeFilePlan(plan, context(approval));
    expect(result.ok).toBe(true);
    expect(approvals).toEqual(['Approve file plan']);
    expect(await fs.readFile(path.join(cwd, 'index.html'), 'utf8')).toBe('hello');
    expect(result.toolCalls.every((call) => call.toolName === 'write_file')).toBe(true);
  });

  it('denied approval changes nothing', async () => {
    const approval = new ApprovalManager('ask', () => Promise.resolve({approved: false}));
    const result = await executeFilePlan({
      commands: [],
      files: [{content: 'x', operation: 'create', path: 'x.txt'}],
      summary: 'Create',
      validation: [],
    }, context(approval));
    expect(result.ok).toBe(false);
    await expect(fs.stat(path.join(cwd, 'x.txt'))).rejects.toThrow();
  });

  it('reports a +0/-0 write as a no-op and does not count it as changed', async () => {
    await fs.writeFile(path.join(cwd, 'styles.css'), 'body{color:red}', 'utf8');
    const approval = new ApprovalManager('ask', () => Promise.resolve({approved: true}));
    const result = await executeFilePlan({
      commands: [],
      files: [
        {content: 'body{color:red}', operation: 'overwrite', path: 'styles.css'},
        {content: 'body{color:blue}', operation: 'modify', path: 'app.css'},
      ],
      summary: 'Edit styles',
      validation: [],
    }, context(approval));
    expect(result.ok).toBe(true);
    expect(result.noopFiles).toEqual(['styles.css']);
    expect(result.filesChanged).toEqual(['app.css']);
    expect(result.summary).toMatch(/1 no-op \(\+0\/-0\)/);
  });

  it('runs commands only after command approval', async () => {
    const approval = new ApprovalManager('ask', () => Promise.resolve({approved: true}));
    const result = await executeFilePlan({
      commands: [{command: 'node -e "console.log(1)"', reason: 'smoke'}],
      files: [],
      summary: 'Run smoke',
      validation: [],
    }, context(approval));
    expect(result.commandsRun).toEqual(['node -e "console.log(1)"']);
    expect(result.toolCalls.at(-1)?.toolName).toBe('run_command');
  });
});
