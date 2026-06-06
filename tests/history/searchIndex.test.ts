import fs from 'node:fs/promises';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {createSession, type ConversationSession} from '../../src/agent/session.js';
import {searchWorkspaceHistory} from '../../src/history/searchIndex.js';
import {SessionStore} from '../../src/sessions/store.js';
import {TaskStore} from '../../src/tasks/taskStore.js';
import type {TaskPlan} from '../../src/tasks/types.js';
import {appendEditHistoryRecord} from '../../src/tools/patch/editHistory.js';
import type {EditHistoryRecord} from '../../src/tools/patch/types.js';
import {createWorkspace, type WorkspaceSetup} from '../helpers/workflow.js';

describe('searchWorkspaceHistory', () => {
  let workspace: WorkspaceSetup;

  beforeEach(async () => {
    workspace = await createWorkspace();
    await fs.mkdir(path.join(workspace.projectDir, '.apeironcode-agent'), {recursive: true});
    await fs.writeFile(
      path.join(workspace.projectDir, '.apeironcode-agent', 'memory.md'),
      [
        '# Project Memory',
        '',
        '## Purpose',
        'Refactor the parser without breaking the lexer.',
        '',
        '## Important Files',
        '- src/parser.ts',
      ].join('\n'),
      'utf8',
    );
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  it('finds matching sessions, tasks, edits, and memory entries', async () => {
    const sessionStore = new SessionStore();
    const taskStore = new TaskStore(workspace.projectDir);

    const session: ConversationSession = {
      ...createSession(workspace.projectDir, 'mock', 'mock-coder', {prompt: 'Refactor the parser'}),
      sessionMemory: {
        commandsRun: ['npm test'],
        createdAt: new Date().toISOString(),
        decisionsMade: ['parser:approved'],
        failedAttempts: [],
        filesInspected: ['src/parser.ts'],
        filesModified: ['src/parser.ts'],
        finalResult: 'Refactored parser flow successfully.',
        goal: 'Refactor the parser',
        memorySuggestions: [
          {category: 'file', decision: 'saved', summary: 'src/parser.ts'},
        ],
        summary: 'Refactored parser flow successfully.',
        testsRun: ['npm test'],
      },
      title: 'Refactor parser flow',
      updatedAt: new Date().toISOString(),
    };
    await sessionStore.save(session);

    const task: TaskPlan = {
      commandsRun: ['npm test'],
      createdAt: new Date().toISOString(),
      filesChanged: ['src/parser.ts'],
      filesInspected: ['src/parser.ts'],
      finalSummary: 'Refactor parser flow completed.',
      goal: 'Refactor parser flow',
      id: 'task-parser',
      linkedSessionId: session.id,
      memorySuggestions: ['saved:file:src/parser.ts'],
      mode: 'fix',
      permissionDecisions: [],
      status: 'completed',
      steps: [],
      testsRun: ['npm test'],
      updatedAt: new Date().toISOString(),
    };
    await taskStore.save(task);

    const edit: EditHistoryRecord = {
      addedLines: 12,
      approvalDecision: 'approved',
      diff: '@@ -1 +1 @@\n-parser\n+refactored parser',
      filePath: 'src/parser.ts',
      id: 'edit-parser',
      newHash: 'new-hash',
      oldHash: 'old-hash',
      operationType: 'search_replace',
      promptOrGoal: 'Refactor parser flow',
      sessionId: session.id,
      timestamp: new Date().toISOString(),
      toolIdentity: 'patch_file',
      removedLines: 4,
    };
    await appendEditHistoryRecord(workspace.projectDir, edit);

    const results = await searchWorkspaceHistory({
      cwd: workspace.projectDir,
      query: 'parser',
      sessionStore,
      taskStore,
    });

    expect(results.some((result) => result.kind === 'session')).toBe(true);
    expect(results.some((result) => result.kind === 'task')).toBe(true);
    expect(results.some((result) => result.kind === 'edit')).toBe(true);
    expect(results.some((result) => result.kind === 'memory')).toBe(true);
  });
});