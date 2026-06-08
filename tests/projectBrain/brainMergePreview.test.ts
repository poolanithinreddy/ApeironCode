import {describe, it, expect} from 'vitest';

import {
  createTasksMergePreview,
  createPlanMergePreview,
  createBrainFileMergePreview,
  formatBrainMergePreview,
} from '../../src/projectBrain/brainMergePreview.js';
import type {BgTaskFacts} from '../../src/projectBrain/taskPlanSync.js';
import type {ExtractedRunFacts} from '../../src/projectBrain/runExtractor.js';

const makeBgTask = (partial: Partial<BgTaskFacts> = {}): BgTaskFacts => ({
  id: 'task-001',
  title: 'Add user authentication',
  status: 'succeeded',
  ...partial,
});

const makeRunFacts = (partial: Partial<ExtractedRunFacts> = {}): ExtractedRunFacts => ({
  promptSummary: 'Implemented user authentication',
  changedFiles: ['src/auth.ts', 'src/login.tsx'],
  commandsRun: ['npm test'],
  testsRun: ['auth.test.ts'],
  validationResult: 'all tests passed',
  blockers: [],
  nextSteps: ['Deploy to staging'],
  risks: [],
  timestamp: new Date().toISOString(),
  ...partial,
});

const TASKS_MD = `# Tasks

## In Progress

- [ ] Add user authentication
- [ ] Set up database migrations
- [x] Initialize project
`;

const PLAN_MD = `# Plan

## Phase 1: Foundation

Set up the project structure.
`;

describe('brainMergePreview', () => {
  describe('createTasksMergePreview', () => {
    it('creates a preview with hasChanges when task matches', () => {
      const preview = createTasksMergePreview(TASKS_MD, makeBgTask());
      expect(preview.hasChanges).toBe(true);
      expect(preview.operations.length).toBeGreaterThan(0);
    });

    it('marks succeeded task as done checkbox', () => {
      const preview = createTasksMergePreview(TASKS_MD, makeBgTask({status: 'succeeded'}));
      const op = preview.operations.find((o) => o.kind === 'checkbox-done');
      expect(op).toBeDefined();
      expect(preview.proposedText).toContain('- [x] Add user authentication');
    });

    it('adds blocker comment for failed task', () => {
      const preview = createTasksMergePreview(TASKS_MD, makeBgTask({
        status: 'failed',
        errorSummary: 'Database connection timeout',
      }));
      const op = preview.operations.find((o) => o.kind === 'checkbox-fail');
      expect(op).toBeDefined();
      expect(preview.proposedText).toContain('Blocker:');
    });

    it('has no checkbox-done operation when no task matches', () => {
      const preview = createTasksMergePreview(TASKS_MD, makeBgTask({title: 'Nonexistent task XYZ that does not exist'}));
      const checkboxDone = preview.operations.find((o) => o.kind === 'checkbox-done');
      expect(checkboxDone).toBeUndefined();
    });

    it('does not expose secrets in proposed text', () => {
      const preview = createTasksMergePreview(TASKS_MD, makeBgTask({
        status: 'failed',
        errorSummary: 'Error: sk-abcdefghijklmnopqrstuvwxyz12345678 not valid',
      }));
      expect(preview.proposedText).not.toContain('sk-abcdefghijklmnopqrstuvwxyz12345678');
    });

    it('sets requiresApproval to true', () => {
      const preview = createTasksMergePreview(TASKS_MD, makeBgTask());
      expect(preview.requiresApproval).toBe(true);
    });
  });

  describe('createPlanMergePreview', () => {
    it('appends Recent Progress section', () => {
      const preview = createPlanMergePreview(PLAN_MD, makeRunFacts());
      expect(preview.proposedText).toContain('Recent Progress');
    });

    it('includes changed files in progress section', () => {
      const preview = createPlanMergePreview(PLAN_MD, makeRunFacts({changedFiles: ['src/auth.ts']}));
      expect(preview.proposedText).toContain('auth.ts');
    });

    it('has changes', () => {
      const preview = createPlanMergePreview(PLAN_MD, makeRunFacts());
      expect(preview.hasChanges).toBe(true);
    });

    it('does not expose secrets', () => {
      const preview = createPlanMergePreview(PLAN_MD, makeRunFacts({promptSummary: 'Used sk-abcdefghijklmnopqrstuvwxyz12345678 for auth'}));
      expect(preview.proposedText).not.toContain('sk-abcdefghijklmnopqrstuvwxyz12345678');
    });
  });

  describe('createBrainFileMergePreview', () => {
    it('creates a generic append preview', () => {
      const preview = createBrainFileMergePreview('# Existing content\n', 'New section content', {cwd: '/tmp/test'});
      expect(preview.hasChanges).toBe(true);
      expect(preview.proposedText).toContain('New section content');
    });

    it('sets backupRequired when existing text is long', () => {
      const longText = '# Existing\n' + 'x'.repeat(200);
      const preview = createBrainFileMergePreview(longText, 'Update', {cwd: '/tmp/test'});
      expect(preview.backupRequired).toBe(true);
    });
  });

  describe('formatBrainMergePreview', () => {
    it('returns a non-empty string', () => {
      const preview = createTasksMergePreview(TASKS_MD, makeBgTask());
      const text = formatBrainMergePreview(preview);
      expect(text.length).toBeGreaterThan(10);
    });

    it('mentions the target file', () => {
      const preview = createTasksMergePreview(TASKS_MD, makeBgTask());
      const text = formatBrainMergePreview(preview);
      expect(text).toContain('TASKS.md');
    });

    it('does not expose secrets in formatted output', () => {
      const preview = createTasksMergePreview(TASKS_MD, makeBgTask({
        status: 'failed',
        errorSummary: 'sk-secret-value-exposed',
      }));
      const text = formatBrainMergePreview(preview);
      expect(text).not.toContain('sk-secret-value-exposed');
    });
  });
});
