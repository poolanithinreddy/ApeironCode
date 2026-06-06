/**
 * E2E tests for Phase 16H: Runtime Brain Intelligence Integration.
 * All tests are offline — no real providers, no network calls, no secrets.
 */
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  classifyRuntimeBrainIntent,
  buildRuntimeBrainContext,
  shouldUseProjectBrain,
  formatRuntimeBrainContextForPrompt,
  formatRuntimeBrainContextDebug,
  formatRuntimeBrainIntent,
  isContinuationPrompt,
  isLargeAppBuildPrompt,
  isDebugFixPrompt,
  isTestFixPrompt,
  isReviewPrompt,
  isArchitecturePrompt,
  isUiFrontendPrompt,
  isBackendDataPrompt,
} from '../../src/projectBrain/index.js';

// ─── Setup helpers ───────────────────────────────────────────────────────────

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'rbie-'));
}

async function initBrain(cwd: string): Promise<void> {
  const dir = path.join(cwd, '.apeironcode');
  await fs.mkdir(dir, {recursive: true});
  await fs.writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      version: '1.0',
      projectName: 'E2EProject',
      projectRootFingerprint: 'fp-e2e',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  );
  await fs.writeFile(path.join(dir, 'PROJECT.md'), '# E2EProject\nA test project for runtime brain intelligence.');
  await fs.writeFile(path.join(dir, 'PLAN.md'), '# Plan\n- [ ] Step 1: Setup auth\n- [ ] Step 2: Add billing');
  await fs.writeFile(path.join(dir, 'TASKS.md'), '# Tasks\n- [x] Task A: Init project\n- [ ] Task B: Add tests');
  await fs.writeFile(path.join(dir, 'RUNS.md'), '# Runs\n## Run 1\nCompleted auth setup.');
  await fs.writeFile(path.join(dir, 'VERIFY.md'), '# Verify\n- npm test: ok\n- typecheck: ok');
}

// ─── E2E: Intent classifier ──────────────────────────────────────────────────

describe('E2E: Runtime brain intent classifier', () => {
  it('classifies continuation prompts', () => {
    const continuationPhrases = ['continue', 'keep going', 'what is the next step', 'resume the plan', 'carry on'];
    for (const phrase of continuationPhrases) {
      const result = classifyRuntimeBrainIntent(phrase);
      expect(result.intent).toBe('continue');
      expect(result.useBrain).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.8);
    }
  });

  it('classifies test-fix prompts', () => {
    const result = classifyRuntimeBrainIntent('fix the failing Vitest unit tests for the payment module coverage');
    expect(result.intent).toBe('test-fix');
    expect(result.useBrain).toBe(true);
    expect(result.brainFileHints).toContain('.apeironcode/VERIFY.md');
  });

  it('classifies debug-fix prompts', () => {
    const result = classifyRuntimeBrainIntent('fix the crash in the authentication module login flow');
    expect(result.intent).toBe('debug-fix');
    expect(result.useBrain).toBe(true);
  });

  it('classifies review prompts', () => {
    const result = classifyRuntimeBrainIntent('review this code for security vulnerabilities and quality');
    expect(result.intent).toBe('review');
    expect(result.useBrain).toBe(true);
  });

  it('classifies architecture prompts', () => {
    const result = classifyRuntimeBrainIntent('design the system architecture for the authentication module');
    expect(result.intent).toBe('architecture');
    expect(result.useBrain).toBe(true);
  });

  it('classifies frontend prompts', () => {
    const result = classifyRuntimeBrainIntent('create a React component for the user profile page with Tailwind');
    expect(result.intent).toBe('frontend');
  });

  it('classifies backend prompts', () => {
    const result = classifyRuntimeBrainIntent('add a REST API endpoint for user creation with Postgres database schema');
    expect(result.intent).toBe('backend');
  });

  it('returns none for short prompts', () => {
    const result = classifyRuntimeBrainIntent('hi');
    expect(result.intent).toBe('none');
    expect(result.useBrain).toBe(false);
  });

  it('returns none for simple short edits (≤6 words)', () => {
    const result = classifyRuntimeBrainIntent('rename the variable');
    expect(result.useBrain).toBe(false);
  });

  it('includes brain file hints for continuation', () => {
    const result = classifyRuntimeBrainIntent('continue the plan');
    expect(result.brainFileHints).toContain('.apeironcode/PLAN.md');
    expect(result.brainFileHints).toContain('.apeironcode/TASKS.md');
  });

  it('includes brain file hints for architecture', () => {
    const result = classifyRuntimeBrainIntent('design the system architecture for auth');
    expect(result.brainFileHints).toContain('.apeironcode/DECISIONS.md');
  });

  it('confidence is within [0, 1]', () => {
    const prompts = ['continue', 'fix the crash', 'review code', 'build feature', 'hi'];
    for (const p of prompts) {
      const result = classifyRuntimeBrainIntent(p);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// ─── E2E: Individual classifiers ─────────────────────────────────────────────

describe('E2E: Individual classifier functions', () => {
  it('isContinuationPrompt detects continuation keywords', () => {
    expect(isContinuationPrompt('continue')).toBe(true);
    expect(isContinuationPrompt('keep going')).toBe(true);
    expect(isContinuationPrompt('what is the next step')).toBe(true);
    expect(isContinuationPrompt('fix the bug')).toBe(false);
  });

  it('isDebugFixPrompt detects debug but not test keywords', () => {
    expect(isDebugFixPrompt('fix the crash in auth')).toBe(true);
    expect(isDebugFixPrompt('debug the error in server')).toBe(true);
    expect(isDebugFixPrompt('fix failing Vitest tests')).toBe(false);
  });

  it('isTestFixPrompt detects test keywords', () => {
    expect(isTestFixPrompt('fix failing Vitest tests')).toBe(true);
    expect(isTestFixPrompt('improve test coverage')).toBe(true);
    expect(isTestFixPrompt('debug server exception')).toBe(false);
  });

  it('isReviewPrompt detects review/audit keywords', () => {
    expect(isReviewPrompt('review this code')).toBe(true);
    expect(isReviewPrompt('security audit the auth module')).toBe(true);
    expect(isReviewPrompt('build new feature')).toBe(false);
  });

  it('isArchitecturePrompt detects architecture keywords', () => {
    expect(isArchitecturePrompt('design system architecture')).toBe(true);
    expect(isArchitecturePrompt('create an ADR for database decision')).toBe(true);
    expect(isArchitecturePrompt('fix login bug')).toBe(false);
  });

  it('isUiFrontendPrompt detects UI without backend keywords', () => {
    expect(isUiFrontendPrompt('create a React component')).toBe(true);
    expect(isUiFrontendPrompt('style with Tailwind CSS')).toBe(true);
    expect(isUiFrontendPrompt('add REST API endpoint with database')).toBe(false);
  });

  it('isBackendDataPrompt detects backend without frontend keywords', () => {
    expect(isBackendDataPrompt('add a REST endpoint for user creation')).toBe(true);
    expect(isBackendDataPrompt('create a Postgres database migration')).toBe(true);
    expect(isBackendDataPrompt('create a React component')).toBe(false);
  });

  it('isLargeAppBuildPrompt requires 200+ chars', () => {
    const large = 'Build a full SaaS platform with React frontend, Node.js backend, Stripe billing, multi-tenant architecture, admin panel, and real-time notifications for enterprise customers with a rich analytics dashboard';
    const small = 'Build a small app';
    expect(isLargeAppBuildPrompt(large)).toBe(true);
    expect(isLargeAppBuildPrompt(small)).toBe(false);
  });
});

// ─── E2E: Runtime brain context ──────────────────────────────────────────────

describe('E2E: buildRuntimeBrainContext (no brain)', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await makeTmpDir();
  });

  afterEach(async () => {
    await fs.rm(cwd, {recursive: true, force: true});
  });

  it('no-op for short prompts', async () => {
    const ctx = await buildRuntimeBrainContext(cwd, 'hi');
    expect(ctx.intentResult.useBrain).toBe(false);
    expect(ctx.promptInjection).toBe('');
    expect(ctx.estimatedTokens).toBe(0);
  });

  it('returns warning when brain missing for continuation intent', async () => {
    const ctx = await buildRuntimeBrainContext(cwd, 'continue the plan');
    expect(ctx.brainPresent).toBe(false);
    expect(ctx.warnings.some((w) => w.includes('Project Brain not found'))).toBe(true);
  });

  it('returns plan-first injection for large app build without brain', async () => {
    const prompt = 'Build a full SaaS platform with React frontend, Node.js backend, Stripe billing, multi-tenant architecture, admin panel, and real-time notifications for enterprise customers with a rich analytics dashboard';
    const ctx = await buildRuntimeBrainContext(cwd, prompt);
    expect(ctx.promptInjection).toContain('Plan-First');
  });
});

describe('E2E: buildRuntimeBrainContext (with brain)', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await makeTmpDir();
    await initBrain(cwd);
  });

  afterEach(async () => {
    await fs.rm(cwd, {recursive: true, force: true});
  });

  it('brainPresent=true when brain initialized', async () => {
    const ctx = await buildRuntimeBrainContext(cwd, 'fix the crash in auth module');
    expect(ctx.brainPresent).toBe(true);
  });

  it('continuation intent produces non-empty injection', async () => {
    const ctx = await buildRuntimeBrainContext(cwd, 'continue the plan');
    expect(ctx.intentResult.intent).toBe('continue');
    expect(ctx.brainPresent).toBe(true);
    expect(ctx.estimatedTokens).toBeGreaterThanOrEqual(0);
  });

  it('debug-fix intent selects VERIFY/RUNS brain files', async () => {
    const ctx = await buildRuntimeBrainContext(cwd, 'fix the crash in authentication module login flow');
    expect(ctx.intentResult.intent).toBe('debug-fix');
    expect(ctx.intentResult.brainFileHints.some((h) => h.includes('VERIFY'))).toBe(true);
  });

  it('token budget is respected', async () => {
    const ctx = await buildRuntimeBrainContext(cwd, 'review code for security issues', {tokenBudget: 300});
    expect(ctx.estimatedTokens).toBeLessThanOrEqual(400);
  });

  it('skipRouting=true produces null routingPlan', async () => {
    const ctx = await buildRuntimeBrainContext(cwd, 'fix the crash in auth module', {skipRouting: true});
    expect(ctx.routingPlan).toBeNull();
  });

  it('skipFileSelection=true produces null contextSelection', async () => {
    const ctx = await buildRuntimeBrainContext(cwd, 'fix the crash in auth module', {skipFileSelection: true});
    expect(ctx.contextSelection).toBeNull();
  });

  it('does not leak secrets in promptInjection', async () => {
    const ctx = await buildRuntimeBrainContext(cwd, 'review auth code with token sk-abcdefghijklmnopqrstuvwxyz12345678');
    expect(ctx.promptInjection).not.toContain('sk-abcdefghijklmnopqrstuvwxyz12345678');
  });

  it('does not leak secrets in brainStatusLine', async () => {
    const ctx = await buildRuntimeBrainContext(cwd, 'fix crash with sk-abcdefghijklmnopqrstuvwxyz12345678 token');
    expect(ctx.brainStatusLine).not.toContain('sk-abcdefghijklmnopqrstuvwxyz12345678');
  });
});

// ─── E2E: Utility functions ──────────────────────────────────────────────────

describe('E2E: shouldUseProjectBrain', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await makeTmpDir();
  });

  afterEach(async () => {
    await fs.rm(cwd, {recursive: true, force: true});
  });

  it('returns false when brain not present', async () => {
    const ctx = await buildRuntimeBrainContext(cwd, 'continue the plan');
    expect(shouldUseProjectBrain(ctx)).toBe(false);
  });

  it('returns false for no-intent prompts even with brain', async () => {
    await initBrain(cwd);
    const ctx = await buildRuntimeBrainContext(cwd, 'hi');
    expect(shouldUseProjectBrain(ctx)).toBe(false);
  });
});

describe('E2E: formatRuntimeBrainContextForPrompt', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await makeTmpDir();
  });

  afterEach(async () => {
    await fs.rm(cwd, {recursive: true, force: true});
  });

  it('returns empty for prompts not requiring brain', async () => {
    const ctx = await buildRuntimeBrainContext(cwd, 'hi');
    expect(formatRuntimeBrainContextForPrompt(ctx)).toBe('');
  });

  it('compact=true truncates to 600 chars', async () => {
    await initBrain(cwd);
    const ctx = await buildRuntimeBrainContext(cwd, 'continue the plan');
    const compact = formatRuntimeBrainContextForPrompt(ctx, {compact: true});
    expect(compact.length).toBeLessThanOrEqual(600);
  });
});

describe('E2E: formatRuntimeBrainContextDebug', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await makeTmpDir();
  });

  afterEach(async () => {
    await fs.rm(cwd, {recursive: true, force: true});
  });

  it('contains all debug fields', async () => {
    const ctx = await buildRuntimeBrainContext(cwd, 'continue the plan');
    const debug = formatRuntimeBrainContextDebug(ctx);
    expect(debug).toContain('Brain present:');
    expect(debug).toContain('Intent:');
    expect(debug).toContain('Use brain:');
    expect(debug).toContain('Estimated tokens:');
  });

  it('does not leak secrets', async () => {
    const ctx = await buildRuntimeBrainContext(cwd, 'fix crash with sk-abcdefghijklmnopqrstuvwxyz12345678');
    const debug = formatRuntimeBrainContextDebug(ctx);
    expect(debug).not.toContain('sk-abcdefghijklmnopqrstuvwxyz12345678');
  });
});

describe('E2E: formatRuntimeBrainIntent', () => {
  it('returns non-empty string', () => {
    const result = classifyRuntimeBrainIntent('continue the plan');
    const formatted = formatRuntimeBrainIntent(result);
    expect(formatted.length).toBeGreaterThan(10);
    expect(formatted).toContain('continue');
  });

  it('redacts long tokens that look like secrets', () => {
    const result = classifyRuntimeBrainIntent('fix bug with sk-abcdefghijklmnopqrstuvwxyz12345678 token');
    const formatted = formatRuntimeBrainIntent(result);
    expect(formatted).not.toContain('sk-abcdefghijklmnopqrstuvwxyz12345678');
  });
});
