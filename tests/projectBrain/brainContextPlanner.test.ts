import {describe, it, expect} from 'vitest';

import {
  detectBrainContextIntent,
  selectBrainFilesForPrompt,
  explainBrainContextSelection,
} from '../../src/projectBrain/brainContextPlanner.js';
import type {ProjectBrainSummary} from '../../src/projectBrain/types.js';

const makeSummary = (partial: Partial<ProjectBrainSummary> = {}): ProjectBrainSummary => ({
  status: 'initialized',
  projectName: 'test-project',
  projectRootFingerprint: 'fp-test',
  keyFilesPresent: [
    '.apeironcode/PROJECT.md',
    '.apeironcode/PLAN.md',
    '.apeironcode/TASKS.md',
    '.apeironcode/RUNS.md',
  ],
  keyFilesMissing: [
    '.apeironcode/DECISIONS.md',
    '.apeironcode/REFERENCES.md',
    '.apeironcode/VERIFY.md',
    '.apeironcode/MEMORY.md',
  ],
  workflowCounts: {agents: 0, skills: 0, commands: 0},
  safeLoadStatus: 'safe-summary',
  notes: [],
  ...partial,
});

describe('brainContextPlanner', () => {
  describe('detectBrainContextIntent', () => {
    it('detects continue intent', () => {
      expect(detectBrainContextIntent('continue where we left off')).toBe('continue');
    });

    it('detects resume intent', () => {
      expect(detectBrainContextIntent('resume the current task')).toBe('continue');
    });

    it('detects app-build intent for long build prompts', () => {
      const prompt = 'build a complete multi-tenant SaaS platform with billing, admin panel, and analytics for enterprise customers as a product';
      expect(detectBrainContextIntent(prompt)).toBe('app-build');
    });

    it('detects architecture intent', () => {
      expect(detectBrainContextIntent('design the architecture for this system with ADR')).toBe('architecture');
    });

    it('detects bug-fix intent', () => {
      expect(detectBrainContextIntent('fix the crash in the login module')).toBe('bug-fix');
    });

    it('detects frontend intent', () => {
      expect(detectBrainContextIntent('create a React component with Tailwind CSS')).toBe('frontend');
    });

    it('detects backend intent', () => {
      expect(detectBrainContextIntent('implement a REST API endpoint with database schema')).toBe('backend');
    });

    it('detects test intent', () => {
      expect(detectBrainContextIntent('write Vitest unit tests for the payment module coverage')).toBe('test');
    });

    it('detects review intent', () => {
      expect(detectBrainContextIntent('security audit and code review the codebase')).toBe('review');
    });

    it('falls back to general for unknown prompts', () => {
      expect(detectBrainContextIntent('what is 2 + 2')).toBe('general');
    });
  });

  describe('selectBrainFilesForPrompt', () => {
    it('returns a valid selection object', () => {
      const selection = selectBrainFilesForPrompt('continue where we left off', makeSummary());
      expect(selection.intent).toBe('continue');
      expect(Array.isArray(selection.selectedFiles)).toBe(true);
      expect(typeof selection.estimatedTokens).toBe('number');
      expect(typeof selection.tokenBudget).toBe('number');
    });

    it('respects custom token budget', () => {
      const selection = selectBrainFilesForPrompt(
        'fix the bug in auth',
        makeSummary(),
        {tokenBudget: 200},
      );
      expect(selection.tokenBudget).toBe(200);
    });

    it('only includes files that exist per summary', () => {
      const summary = makeSummary({keyFilesPresent: ['.apeironcode/PROJECT.md'], keyFilesMissing: ['.apeironcode/PLAN.md', '.apeironcode/TASKS.md', '.apeironcode/RUNS.md']});
      const selection = selectBrainFilesForPrompt('continue', summary);
      const paths = selection.selectedFiles.map((f) => f.relativePath);
      // PLAN.md should not appear since it's not in keyFilesPresent
      expect(paths.every((p) => summary.keyFilesPresent.includes(p))).toBe(true);
    });

    it('continues intent prioritizes PLAN.md and TASKS.md', () => {
      const selection = selectBrainFilesForPrompt('continue', makeSummary());
      const paths = selection.selectedFiles.map((f) => f.relativePath);
      const hasHighPriority = paths.some((p) => p.includes('PLAN.md') || p.includes('TASKS.md'));
      expect(hasHighPriority).toBe(true);
    });

    it('includes selectionReason string', () => {
      const selection = selectBrainFilesForPrompt('fix a bug', makeSummary());
      expect(typeof selection.selectionReason).toBe('string');
      expect(selection.selectionReason.length).toBeGreaterThan(0);
    });
  });

  describe('explainBrainContextSelection', () => {
    it('returns a non-empty explanation', () => {
      const selection = selectBrainFilesForPrompt('continue the plan', makeSummary());
      const explanation = explainBrainContextSelection(selection);
      expect(typeof explanation).toBe('string');
      expect(explanation.length).toBeGreaterThan(10);
    });

    it('mentions intent in explanation', () => {
      const selection = selectBrainFilesForPrompt('fix the crash', makeSummary());
      const explanation = explainBrainContextSelection(selection);
      expect(explanation.toLowerCase()).toContain('bug-fix');
    });
  });
});
