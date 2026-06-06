import {z} from 'zod';
import {describe, expect, it} from 'vitest';
import {classifyToolExposureMode, selectToolsForPrompt} from '../../src/tools/exposurePolicy.js';
import type {ToolDefinition} from '../../src/tools/types.js';

const tool = (name: string): ToolDefinition => ({
  description: `${name} tool`,
  inputSchema: z.object({}),
  name,
  requiresApproval: false,
  riskLevel: 'low',
  run: () => Promise.resolve({ok: true, output: '', summary: ''}),
});

const tools = ['read_file', 'grep', 'glob', 'write_file', 'patch_file', 'run_command', 'test_runner', 'git_diff', 'linear_get_issue', 'slack_send_message'].map(tool);

describe('pure chat exposes zero tools', () => {
  for (const prompt of ['hi', 'hello', 'what can you do?', 'who are you?']) {
    it(`"${prompt}" → none`, () => {
      expect(classifyToolExposureMode(prompt)).toBe('none');
      const decision = selectToolsForPrompt(prompt, 'chat', tools);
      expect(decision.includedTools).toEqual([]);
      expect(decision.estimatedSchemaTokens).toBe(0);
    });
  }

  it('a real task still gets tools', () => {
    expect(selectToolsForPrompt('edit the readme title', 'edit', tools).includedTools.length).toBeGreaterThan(0);
  });
});

describe('tool exposure policy', () => {
  it('reduces tools for simple prompts and exposes connector/debug tools when relevant', () => {
    const simple = selectToolsForPrompt('explain package json', 'explain', tools);
    expect(simple.includedTools).toContain('read_file');
    expect(simple.includedTools).not.toContain('write_file');
    expect(simple.includedTools.length).toBeLessThan(tools.length);

    const connector = selectToolsForPrompt('check Linear issue ENG-1', 'chat', tools);
    expect(connector.includedTools).toContain('linear_get_issue');
    expect(connector.includedTools).not.toContain('write_file');

    const debug = selectToolsForPrompt('debug failing vitest', 'debug', tools);
    expect(debug.includedTools).toContain('run_command');
    expect(debug.includedTools).toContain('test_runner');
    expect(classifyToolExposureMode('use full tools for this migration', 'feature')).toBe('full');
  });

  it('enforces provider capability and schema token budget', () => {
    const none = selectToolsForPrompt('explain package json', 'explain', tools, {
      providerCapabilities: {nativeToolCalling: false},
    });
    expect(none.includedTools).toHaveLength(0);

    const budgeted = selectToolsForPrompt('implement and test and edit and diff', 'edit', tools, {
      maxSchemaTokens: 8,
    });
    expect(budgeted.estimatedSchemaTokens).toBeLessThanOrEqual(8);
  });
});

describe('todo_write is constrained (Phase 17C)', () => {
  const withTodo = ['read_file', 'write_file', 'run_command', 'todo_write'].map(tool);

  it('does not expose todo_write for app build/run/fix prompts', () => {
    const edit = selectToolsForPrompt('build and run the next.js todo app and fix errors', 'edit', withTodo);
    expect(edit.includedTools).not.toContain('todo_write');
    const dbg = selectToolsForPrompt('debug the failing build', 'debug', withTodo);
    expect(dbg.includedTools).not.toContain('todo_write');
  });

  it('exposes todo_write only in explicit planning/task contexts', () => {
    const planning = selectToolsForPrompt('break this task down into a todo list checklist', 'edit', withTodo);
    expect(planning.includedTools).toContain('todo_write');
    const planMode = selectToolsForPrompt('implement the feature', 'plan', withTodo);
    expect(planMode.includedTools).toContain('todo_write');
  });
});

describe('ambiguous prompts default to read-only, not edit (Phase 17E)', () => {
  const richTools = ['read_file', 'grep', 'list_files', 'project_tree', 'write_file', 'run_command'].map(tool);

  it('does not expose write_file or run_command for a debug question with no fix intent', () => {
    // Real user prompt from the routing audit. Previously fell through to
    // edit mode because the prompt is >5 words; now stays read-only.
    const decision = selectToolsForPrompt('why is my function returning undefined?', undefined, richTools);
    expect(decision.includedTools).toContain('read_file');
    expect(decision.includedTools).not.toContain('write_file');
    expect(decision.includedTools).not.toContain('run_command');
  });

  it('still routes a real write request to edit mode', () => {
    const decision = selectToolsForPrompt('write a python script that downloads RSS feeds', undefined, richTools);
    expect(decision.includedTools).toContain('write_file');
    expect(decision.includedTools).toContain('run_command');
  });

  it('classifies an ambiguous long question as read-only mode', () => {
    expect(classifyToolExposureMode('why is my function returning undefined?')).toBe('read-only');
  });
});

describe('command_output is gated on an active session (Phase 17D)', () => {
  const withCmdOut = ['read_file', 'run_command', 'command_output'].map(tool);

  it('does not expose command_output by default (no active session)', () => {
    const d = selectToolsForPrompt('debug the failing build and inspect output', 'debug', withCmdOut);
    expect(d.includedTools).not.toContain('command_output');
  });

  it('exposes command_output only when a background session is active', () => {
    const d = selectToolsForPrompt('show me the background command output', 'debug', withCmdOut, {
      hasActiveCommandSession: true,
    });
    expect(d.includedTools).toContain('command_output');
  });
});
