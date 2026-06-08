import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {runCodingTask} from '../../src/agent/codingOrchestrator.js';
import type {ProviderChatOptions, ProviderStreamChunk, ModelProvider} from '../../src/providers/types.js';
import {ApprovalManager} from '../../src/safety/approvals.js';
import {AuditLog} from '../../src/safety/auditLog.js';
import {ToolRegistry} from '../../src/tools/registry.js';
import {writeFileTool} from '../../src/tools/writeFile.js';
import {runCommandTool} from '../../src/tools/runCommand.js';
import {createMockConfig} from '../support/mocks.js';

class Provider implements ModelProvider {
  readonly displayName = 'test';
  readonly name = 'test';
  readonly nativeToolFormat = 'anthropic' as const;
  readonly supportsStreaming = true;
  readonly supportsToolCalling = true;
  readonly calls: ProviderChatOptions[] = [];
  constructor(private readonly responses: string[]) {}
  listModels(): Promise<string[]> {
    return Promise.resolve(['test']);
  }
  async *stream(options: ProviderChatOptions): AsyncGenerator<ProviderStreamChunk> {
    await Promise.resolve();
    this.calls.push(options);
    yield {token: this.responses.shift() ?? '{}', type: 'token'};
    yield {type: 'done'};
  }
}

describe('codingOrchestrator', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'coding-orch-'));
  });
  afterEach(async () => {
    await fs.rm(cwd, {force: true, recursive: true});
  });

  const run = (prompt: string, responses: string[]) => {
    const approval = new ApprovalManager('ask', () => Promise.resolve({approved: true}));
    const toolRegistry = new ToolRegistry([writeFileTool, runCommandTool]);
    toolRegistry.configureExecutor({
      approvalManager: approval,
      auditLog: new AuditLog(),
      globalPermissionRules: [],
      sessionId: 'coding',
    });
    return runCodingTask(prompt, {
      approvalManager: approval,
      config: createMockConfig(),
      cwd,
      model: 'test',
      provider: new Provider(responses),
      toolRegistry,
    });
  };

  it('writes a static task manager from a structured file plan', async () => {
    const plan = JSON.stringify({
      commands: [],
      files: [
        {content: '<script src="app.js"></script>', operation: 'create', path: 'index.html'},
        {content: '.done{text-decoration:line-through}', operation: 'create', path: 'styles.css'},
        {content: 'localStorage.setItem("tasks","[]");', operation: 'create', path: 'app.js'},
      ],
      summary: 'Build task app',
      validation: ['Open index.html'],
    });
    const result = await run('Build a task manager web app using HTML CSS JS', [plan]);
    expect(result.toolCalls).toHaveLength(3);
    expect(await fs.readFile(path.join(cwd, 'app.js'), 'utf8')).toContain('localStorage');
    expect(result.finalMessage.content).toContain('index.html');
  });

  it('rejects invalid file plans safely', async () => {
    const result = await run('Build a task manager web app using HTML CSS JS', ['not json']);
    expect(result.toolCalls).toEqual([]);
    expect(result.finalMessage.content).toContain('No files were changed');
  });

  it('returns full-stack planning without writing files', async () => {
    const result = await run('Build a full-stack app with auth database and API', ['Stack: Node. Phase 1: setup.']);
    expect(result.toolCalls).toEqual([]);
    expect(result.finalMessage.content).toContain('No files were written');
  });
});
