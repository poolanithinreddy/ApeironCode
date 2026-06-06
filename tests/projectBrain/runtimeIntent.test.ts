import {describe, it, expect} from 'vitest';

import {
  classifyRuntimeBrainIntent,
  isContinuationPrompt,
  isLargeAppBuildPrompt,
  isDebugFixPrompt,
  isTestFixPrompt,
  isReviewPrompt,
  isArchitecturePrompt,
  isUiFrontendPrompt,
  isBackendDataPrompt,
  formatRuntimeBrainIntent,
} from '../../src/projectBrain/runtimeIntent.js';

describe('runtimeIntent', () => {
  describe('isContinuationPrompt', () => {
    it('detects "continue"', () => expect(isContinuationPrompt('continue')).toBe(true));
    it('detects "keep going"', () => expect(isContinuationPrompt('keep going')).toBe(true));
    it('detects "next step"', () => expect(isContinuationPrompt('what is the next step')).toBe(true));
    it('ignores unrelated prompt', () => expect(isContinuationPrompt('fix the login bug')).toBe(false));
  });

  describe('isLargeAppBuildPrompt', () => {
    const large = 'Build a full SaaS platform with React frontend, Node.js backend, Stripe billing, multi-tenant architecture, admin panel, and real-time notifications for enterprise customers with analytics dashboard';
    const small = 'Build a small app';
    it('detects large build prompt', () => expect(isLargeAppBuildPrompt(large)).toBe(true));
    it('rejects short prompt', () => expect(isLargeAppBuildPrompt(small)).toBe(false));
  });

  describe('isDebugFixPrompt', () => {
    it('detects "fix the crash"', () => expect(isDebugFixPrompt('fix the crash in login module')).toBe(true));
    it('detects "debug error"', () => expect(isDebugFixPrompt('debug the error in payment flow')).toBe(true));
    it('returns false for test prompts', () => expect(isDebugFixPrompt('fix the failing Vitest tests')).toBe(false));
  });

  describe('isTestFixPrompt', () => {
    it('detects failing tests prompt', () => expect(isTestFixPrompt('fix failing Vitest tests for auth module')).toBe(true));
    it('detects coverage prompt', () => expect(isTestFixPrompt('improve test coverage for payment module')).toBe(true));
    it('rejects pure debug prompts', () => expect(isTestFixPrompt('debug the exception in server.ts')).toBe(false));
  });

  describe('isReviewPrompt', () => {
    it('detects code review', () => expect(isReviewPrompt('review this code for security issues')).toBe(true));
    it('detects security audit', () => expect(isReviewPrompt('security audit the authentication module')).toBe(true));
    it('rejects build prompts', () => expect(isReviewPrompt('build a new feature')).toBe(false));
  });

  describe('isArchitecturePrompt', () => {
    it('detects architecture prompt', () => expect(isArchitecturePrompt('design the system architecture for this feature')).toBe(true));
    it('detects ADR prompt', () => expect(isArchitecturePrompt('create an ADR for the database decision')).toBe(true));
    it('rejects unrelated prompt', () => expect(isArchitecturePrompt('fix the login bug')).toBe(false));
  });

  describe('isUiFrontendPrompt', () => {
    it('detects React component prompt', () => expect(isUiFrontendPrompt('create a React component for the dashboard')).toBe(true));
    it('detects Tailwind CSS prompt', () => expect(isUiFrontendPrompt('style the button with Tailwind CSS')).toBe(true));
    it('returns false for backend prompts', () => expect(isUiFrontendPrompt('add a REST API endpoint with database')).toBe(false));
  });

  describe('isBackendDataPrompt', () => {
    it('detects API endpoint prompt', () => expect(isBackendDataPrompt('add a REST endpoint for user creation')).toBe(true));
    it('detects database prompt', () => expect(isBackendDataPrompt('create a Postgres database migration schema')).toBe(true));
    it('returns false for frontend prompts', () => expect(isBackendDataPrompt('create a React component')).toBe(false));
  });

  describe('classifyRuntimeBrainIntent', () => {
    it('classifies continuation intent', () => {
      const result = classifyRuntimeBrainIntent('continue where we left off');
      expect(result.intent).toBe('continue');
      expect(result.useBrain).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('classifies large-app-build intent', () => {
      const prompt = 'Build a full SaaS platform with React frontend, Node.js backend, Stripe billing, multi-tenant architecture, admin panel, and real-time notifications for enterprise customers with analytics dashboard';
      const result = classifyRuntimeBrainIntent(prompt);
      expect(result.intent).toBe('large-app-build');
      expect(result.useBrain).toBe(true);
    });

    it('classifies test-fix intent', () => {
      const result = classifyRuntimeBrainIntent('fix the failing Vitest unit tests for the payment module coverage');
      expect(result.intent).toBe('test-fix');
      expect(result.useBrain).toBe(true);
    });

    it('classifies review intent', () => {
      const result = classifyRuntimeBrainIntent('review this code for security vulnerabilities and quality');
      expect(result.intent).toBe('review');
      expect(result.useBrain).toBe(true);
    });

    it('returns none for very short prompts', () => {
      const result = classifyRuntimeBrainIntent('hi');
      expect(result.intent).toBe('none');
      expect(result.useBrain).toBe(false);
    });

    it('returns none for simple short edits', () => {
      const result = classifyRuntimeBrainIntent('rename the variable');
      expect(result.useBrain).toBe(false);
    });

    it('includes brain file hints for continuation', () => {
      const result = classifyRuntimeBrainIntent('continue the plan');
      expect(result.brainFileHints).toContain('.apeironcode/PLAN.md');
      expect(result.brainFileHints).toContain('.apeironcode/TASKS.md');
    });

    it('classifies debug-fix intent', () => {
      const result = classifyRuntimeBrainIntent('fix the crash in the authentication module');
      expect(result.intent).toBe('debug-fix');
      expect(result.useBrain).toBe(true);
    });

    it('classifies frontend intent', () => {
      const result = classifyRuntimeBrainIntent('create a React component for the user profile page with Tailwind');
      expect(result.intent).toBe('frontend');
    });
  });

  describe('formatRuntimeBrainIntent', () => {
    it('returns non-empty formatted string', () => {
      const result = classifyRuntimeBrainIntent('continue the plan');
      const formatted = formatRuntimeBrainIntent(result);
      expect(formatted.length).toBeGreaterThan(10);
    });

    it('includes intent name', () => {
      const result = classifyRuntimeBrainIntent('continue the plan');
      expect(formatRuntimeBrainIntent(result)).toContain('continue');
    });

    it('redacts secrets', () => {
      const result = classifyRuntimeBrainIntent('fix bug with sk-abcdefghijklmnopqrstuvwxyz12345678 token');
      const formatted = formatRuntimeBrainIntent(result);
      expect(formatted).not.toContain('sk-abcdefghijklmnopqrstuvwxyz12345678');
    });
  });
});
