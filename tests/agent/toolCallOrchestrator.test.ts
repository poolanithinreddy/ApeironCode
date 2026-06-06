import {describe, expect, it} from 'vitest';

import {
  classifyToolCallRisk,
  executeOrchestrated,
  planToolCallExecution,
} from '../../src/agent/toolCallOrchestrator.js';

describe('classifyToolCallRisk', () => {
  it('classifies read tools as readonly', () => {
    expect(classifyToolCallRisk('read_file')).toBe('readonly');
    expect(classifyToolCallRisk('grep')).toBe('readonly');
  });
  it('classifies edit tools as write', () => {
    expect(classifyToolCallRisk('edit_file')).toBe('write');
    expect(classifyToolCallRisk('write_file')).toBe('write');
  });
  it('classifies run_command as command', () => {
    expect(classifyToolCallRisk('run_command')).toBe('command');
    expect(classifyToolCallRisk('test_runner')).toBe('command');
  });
  it('classifies github/mcp tools as connector', () => {
    expect(classifyToolCallRisk('github_create_pr')).toBe('connector');
    expect(classifyToolCallRisk('mcp:server.tool')).toBe('connector');
  });
});

describe('planToolCallExecution', () => {
  it('groups consecutive reads into one parallel group', () => {
    const plan = planToolCallExecution([
      {id: 'a', name: 'read_file'},
      {id: 'b', name: 'grep'},
    ]);
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0]?.parallel).toBe(true);
    expect(plan.groups[0]?.callIndices).toEqual([0, 1]);
  });

  it('separates writes into individual serial groups', () => {
    const plan = planToolCallExecution([
      {id: 'a', name: 'read_file'},
      {id: 'b', name: 'edit_file'},
      {id: 'c', name: 'write_file'},
    ]);
    expect(plan.groups).toHaveLength(3);
    expect(plan.groups[1]?.parallel).toBe(false);
    expect(plan.groups[2]?.parallel).toBe(false);
  });
});

describe('executeOrchestrated', () => {
  it('runs two read-only calls in parallel', async () => {
    let runningCount = 0;
    let maxRunning = 0;
    const executor = async (): Promise<string> => {
      runningCount += 1;
      maxRunning = Math.max(maxRunning, runningCount);
      await new Promise((r) => setTimeout(r, 20));
      runningCount -= 1;
      return 'ok';
    };
    const results = await executeOrchestrated(
      [{id: 'a', name: 'read_file', input: {}}, {id: 'b', name: 'grep', input: {}}],
      executor,
    );
    expect(maxRunning).toBe(2);
    expect(results).toHaveLength(2);
  });

  it('serializes read then write', async () => {
    const order: string[] = [];
    const executor = async (id: string): Promise<string> => {
      order.push(`start:${id}`);
      await new Promise((r) => setTimeout(r, 5));
      order.push(`end:${id}`);
      return 'ok';
    };
    await executeOrchestrated(
      [{id: 'r', name: 'read_file', input: {}}, {id: 'w', name: 'edit_file', input: {}}],
      executor,
    );
    expect(order).toEqual(['start:r', 'end:r', 'start:w', 'end:w']);
  });

  it('serializes two writes', async () => {
    const order: string[] = [];
    const executor = async (id: string): Promise<string> => {
      order.push(`start:${id}`);
      await new Promise((r) => setTimeout(r, 5));
      order.push(`end:${id}`);
      return 'ok';
    };
    await executeOrchestrated(
      [{id: 'a', name: 'edit_file', input: {}}, {id: 'b', name: 'write_file', input: {}}],
      executor,
    );
    expect(order).toEqual(['start:a', 'end:a', 'start:b', 'end:b']);
  });

  it('preserves results when one tool fails', async () => {
    const executor = (id: string): Promise<string> => {
      if (id === 'b') return Promise.reject(new Error('boom'));
      return Promise.resolve('ok');
    };
    const results = await executeOrchestrated(
      [{id: 'a', name: 'read_file', input: {}}, {id: 'b', name: 'read_file', input: {}}],
      executor,
    );
    expect(results[0]?.error).toBeUndefined();
    expect(results[0]?.result).toBe('ok');
    expect(results[1]?.error).toBeInstanceOf(Error);
  });

  it('returns results in original index order', async () => {
    const executor = async (id: string, name: string, input: unknown): Promise<unknown> => {
      void id; void name;
      const delay = (input as {delay: number}).delay;
      await new Promise((r) => setTimeout(r, delay));
      return input;
    };
    const results = await executeOrchestrated(
      [
        {id: 'a', name: 'read_file', input: {delay: 30}},
        {id: 'b', name: 'read_file', input: {delay: 5}},
      ],
      executor,
    );
    expect(results[0]?.toolCallId).toBe('a');
    expect(results[1]?.toolCallId).toBe('b');
  });

  it('calls onStart and onComplete callbacks', async () => {
    const starts: string[] = [];
    const completes: string[] = [];
    await executeOrchestrated(
      [{id: 'a', name: 'read_file', input: {}}],
      () => Promise.resolve('ok'),
      {
        onStart: (_id, name) => starts.push(name),
        onComplete: (r) => completes.push(r.toolName),
      },
    );
    expect(starts).toEqual(['read_file']);
    expect(completes).toEqual(['read_file']);
  });
});
