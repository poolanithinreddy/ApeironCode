import {describe, it, expect} from 'vitest';

import {
  createLargeAppBuildOrchestration,
  createInitialBrainFilesFromOrchestration,
  formatLargeAppOrchestration,
} from '../../src/projectBrain/largeAppOrchestrator.js';

const LARGE_PROMPT = 'Build a full SaaS platform with React frontend, Node.js backend, Stripe billing, multi-tenant architecture, admin panel, and real-time notifications for enterprise customers with analytics dashboard';

describe('largeAppOrchestrator', () => {
  describe('createLargeAppBuildOrchestration', () => {
    it('returns an orchestration object for a large build prompt', () => {
      const orch = createLargeAppBuildOrchestration(LARGE_PROMPT);
      expect(orch.productVision).toBeTruthy();
      expect(Array.isArray(orch.phases)).toBe(true);
      expect(orch.phases.length).toBeGreaterThan(0);
    });

    it('detects relevant stack items', () => {
      const orch = createLargeAppBuildOrchestration(LARGE_PROMPT);
      const stackStr = orch.stack.join(' ').toLowerCase();
      expect(stackStr).toMatch(/react|next|node/i);
    });

    it('generates task backlog from phases', () => {
      const orch = createLargeAppBuildOrchestration(LARGE_PROMPT);
      expect(Array.isArray(orch.taskBacklog)).toBe(true);
      expect(orch.taskBacklog.length).toBeGreaterThan(0);
    });

    it('includes first three actions', () => {
      const orch = createLargeAppBuildOrchestration(LARGE_PROMPT);
      expect(Array.isArray(orch.firstThreeActions)).toBe(true);
      expect(orch.firstThreeActions.length).toBeGreaterThan(0);
      expect(orch.firstThreeActions.length).toBeLessThanOrEqual(3);
    });

    it('suggests project brain for large builds', () => {
      const orch = createLargeAppBuildOrchestration(LARGE_PROMPT);
      expect(orch.suggestsProjectBrain).toBe(true);
    });

    it('limits questions to maxQuestions', () => {
      const orch = createLargeAppBuildOrchestration(LARGE_PROMPT, undefined, {maxQuestions: 2});
      expect(orch.questions.length).toBeLessThanOrEqual(2);
    });

    it('includes architecture outline', () => {
      const orch = createLargeAppBuildOrchestration(LARGE_PROMPT);
      expect(Array.isArray(orch.architectureOutline)).toBe(true);
    });

    it('includes risk list', () => {
      const orch = createLargeAppBuildOrchestration(LARGE_PROMPT);
      expect(Array.isArray(orch.riskList)).toBe(true);
    });

    it('includes verification strategy', () => {
      const orch = createLargeAppBuildOrchestration(LARGE_PROMPT);
      expect(Array.isArray(orch.verificationStrategy)).toBe(true);
    });

    it('includes token strategy', () => {
      const orch = createLargeAppBuildOrchestration(LARGE_PROMPT);
      expect(typeof orch.tokenStrategy).toBe('string');
      expect(orch.tokenStrategy.length).toBeGreaterThan(0);
    });
  });

  describe('createInitialBrainFilesFromOrchestration', () => {
    it('returns all four core brain files', () => {
      const orch = createLargeAppBuildOrchestration(LARGE_PROMPT);
      const files = createInitialBrainFilesFromOrchestration(orch);
      expect(files['PROJECT.md']).toBeTruthy();
      expect(files['PLAN.md']).toBeTruthy();
      expect(files['TASKS.md']).toBeTruthy();
      expect(files['VERIFY.md']).toBeTruthy();
    });

    it('PROJECT.md contains product vision', () => {
      const orch = createLargeAppBuildOrchestration(LARGE_PROMPT);
      const files = createInitialBrainFilesFromOrchestration(orch);
      expect(files['PROJECT.md']).toContain(orch.productVision);
    });

    it('TASKS.md contains checkbox items', () => {
      const orch = createLargeAppBuildOrchestration(LARGE_PROMPT);
      const files = createInitialBrainFilesFromOrchestration(orch);
      expect(files['TASKS.md']).toContain('- [ ]');
    });

    it('PLAN.md contains phase headings', () => {
      const orch = createLargeAppBuildOrchestration(LARGE_PROMPT);
      const files = createInitialBrainFilesFromOrchestration(orch);
      expect(files['PLAN.md']).toMatch(/##|Phase/i);
    });
  });

  describe('formatLargeAppOrchestration', () => {
    it('returns a non-empty string', () => {
      const orch = createLargeAppBuildOrchestration(LARGE_PROMPT);
      const text = formatLargeAppOrchestration(orch);
      expect(text.length).toBeGreaterThan(100);
    });

    it('does not expose secrets', () => {
      const orch = createLargeAppBuildOrchestration('Build an app using sk-abcdefghijklmnopqrstuvwxyz12345678 for auth and payments system product');
      const text = formatLargeAppOrchestration(orch);
      expect(text).not.toContain('sk-abcdefghijklmnopqrstuvwxyz12345678');
    });

    it('includes phase names', () => {
      const orch = createLargeAppBuildOrchestration(LARGE_PROMPT);
      const text = formatLargeAppOrchestration(orch);
      const phaseNames = orch.phases.map((p) => p.name);
      const hasPhase = phaseNames.some((name) => text.includes(name));
      expect(hasPhase).toBe(true);
    });
  });
});
