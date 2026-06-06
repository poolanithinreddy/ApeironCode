import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {appendEditHistoryRecord, queryEditHistory} from '../../src/tools/patch/editHistory.js';

describe('edit history queries', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-edit-history-'));
  });

  afterEach(async () => {
    await fs.rm(projectDir, {force: true, recursive: true});
  });

  it('filters edit history by file, session, and limit', async () => {
    await appendEditHistoryRecord(projectDir, {
      addedLines: 2,
      approvalDecision: 'approved',
      diff: 'diff-1',
      filePath: 'src/one.ts',
      id: 'edit-1',
      newHash: 'new-1',
      oldHash: 'old-1',
      operationType: 'full_rewrite',
      removedLines: 1,
      sessionId: 'session-a',
      timestamp: '2024-01-01T00:00:00.000Z',
      toolIdentity: 'write_file',
    });
    await appendEditHistoryRecord(projectDir, {
      addedLines: 3,
      approvalDecision: 'approved',
      diff: 'diff-2',
      filePath: 'src/two.ts',
      id: 'edit-2',
      newHash: 'new-2',
      oldHash: 'old-2',
      operationType: 'search_replace',
      removedLines: 2,
      sessionId: 'session-b',
      timestamp: '2024-01-02T00:00:00.000Z',
      toolIdentity: 'edit_file',
    });
    await appendEditHistoryRecord(projectDir, {
      addedLines: 1,
      approvalDecision: 'approved',
      diff: 'diff-3',
      filePath: 'src/one.ts',
      id: 'edit-3',
      newHash: 'new-3',
      oldHash: 'old-3',
      operationType: 'revert',
      removedLines: 4,
      sessionId: 'session-a',
      timestamp: '2024-01-03T00:00:00.000Z',
      toolIdentity: 'revert_patch',
    });

    expect(await queryEditHistory(projectDir, {filePath: 'src/one.ts'})).toMatchObject([
      {id: 'edit-3'},
      {id: 'edit-1'},
    ]);
    expect(await queryEditHistory(projectDir, {sessionId: 'session-b'})).toMatchObject([
      {id: 'edit-2'},
    ]);
    expect(await queryEditHistory(projectDir, {limit: 1})).toMatchObject([
      {id: 'edit-3'},
    ]);
  });
});