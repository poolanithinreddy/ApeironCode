import {describe, expect, it} from 'vitest';

import {compactSession} from '../../src/sessions/compaction.js';

describe('session compaction', () => {
  it('preserves recent messages and summarizes task state and tools', () => {
    const result = compactSession({
      messages: [
        {
          content: 'first request',
          createdAt: '2024-01-01T00:00:00.000Z',
          id: '1',
          role: 'user',
        },
        {
          content: 'second request',
          createdAt: '2024-01-01T00:01:00.000Z',
          id: '2',
          role: 'assistant',
        },
      ],
      taskState: {
        commandsRun: [],
        errors: [],
        filesChanged: ['src/app.ts'],
        filesRead: ['src/app.ts'],
        goal: 'ship feature',
        mode: 'edit',
        plan: ['inspect', 'patch', 'validate'],
        startedAt: '2024-01-01T00:00:00.000Z',
        summary: null,
        testsRun: ['npm run typecheck'],
        todos: [],
        updatedAt: '2024-01-01T00:00:20.000Z',
      },
      toolCalls: [
        {
          createdAt: '2024-01-01T00:00:10.000Z',
          explanation: 'Update the file through the patch engine',
          id: 'tool-1',
          input: {path: 'src/app.ts'},
          result: {ok: true, output: '', summary: 'updated file'},
          status: 'success',
          toolName: 'patch_file',
        },
      ],
    });

    expect(result.retainedMessages).toHaveLength(2);
    expect(result.summary).toContain('Goal: ship feature');
    expect(result.summary).toContain('Files changed: src/app.ts');
    expect(result.summary).toContain('patch_file: updated file');
  });
});