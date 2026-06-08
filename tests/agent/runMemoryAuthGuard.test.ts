import {describe, expect, it} from 'vitest';

import {runProducedUsefulEvidence} from '../../src/agent/runMemory.js';
import {MemoryManager} from '../../src/agent/memoryManager.js';

const baseTaskState = (overrides: Record<string, unknown> = {}) => ({
  commandsRun: [],
  errors: [],
  filesChanged: [],
  filesRead: [],
  goal: 'hi',
  mode: 'chat' as const,
  plan: [],
  startedAt: new Date().toISOString(),
  summary: null,
  testsRun: [],
  todos: [],
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const result = (finalContent: string, taskState: unknown, toolCalls: unknown[] = []) =>
  ({
    finalMessage: {content: finalContent, role: 'assistant', id: 'm', createdAt: ''},
    messages: [],
    plan: undefined,
    taskState,
    toolCalls,
    usage: {inputTokens: 0, outputTokens: 0, totalTokens: 0},
  }) as unknown as Parameters<typeof runProducedUsefulEvidence>[0];

describe('runProducedUsefulEvidence (memory eligibility)', () => {
  it('rejects a provider 401 auth failure run', () => {
    expect(
      runProducedUsefulEvidence(
        result('Provider returned 401: Unauthorized', baseTaskState({errors: ['Provider returned 401: Unauthorized']})),
      ),
    ).toBe(false);
  });

  it('rejects a clean-auth-error final message', () => {
    expect(
      runProducedUsefulEvidence(
        result('GitHub Models authentication failed. Possible fixes: ...', baseTaskState()),
      ),
    ).toBe(false);
  });

  it('rejects an empty failed chat with no evidence', () => {
    expect(runProducedUsefulEvidence(result('I could not help.', baseTaskState()))).toBe(false);
  });

  it('rejects a contract tool-arg failure (read_file requires path)', () => {
    expect(
      runProducedUsefulEvidence(
        result(
          'Tool read_file failed: read_file requires path',
          baseTaskState({errors: ['read_file requires path']}),
        ),
      ),
    ).toBe(false);
  });

  it('rejects a write_file / todo_write contract failure', () => {
    expect(
      runProducedUsefulEvidence(
        result(
          'write_file requires path and content',
          baseTaskState({errors: ['write_file requires path and content']}),
        ),
      ),
    ).toBe(false);
    expect(
      runProducedUsefulEvidence(
        result('todo_write requires todos', baseTaskState({errors: ['todo_write requires todos']})),
      ),
    ).toBe(false);
  });

  it('accepts a successful run that changed files', () => {
    expect(
      runProducedUsefulEvidence(
        result('Done. Updated the parser.', baseTaskState({filesChanged: ['src/parser.ts']})),
      ),
    ).toBe(true);
  });

  it('accepts a run with a successful tool call', () => {
    expect(
      runProducedUsefulEvidence(
        result('Listed the tree.', baseTaskState(), [{status: 'success', toolName: 'project_tree'}]),
      ),
    ).toBe(true);
  });
});

describe('memoryManager drops provider/auth failures from pitfalls', () => {
  it('does not record "Provider returned 401" as a pitfall or recent error', () => {
    const manager = new MemoryManager('/tmp/opencode-memory-auth-test');
    const extracted = manager.extractProjectMemoryFromRun({
      goal: 'hi',
      mode: 'fix',
      relevantFiles: ['src/parser.ts'],
      taskState: baseTaskState({
        filesChanged: ['src/parser.ts'],
        errors: ['Provider returned 401: Unauthorized', 'TypeError: cannot read foo of undefined'],
      }),
    });
    const serialized = JSON.stringify(extracted);
    expect(serialized).not.toContain('401');
    expect(serialized).not.toContain('Unauthorized');
    // A genuine code error is still durable knowledge.
    expect(serialized).toContain('TypeError');
  });
});
