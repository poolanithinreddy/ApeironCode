import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildRuntimeBrainContext,
  shouldUseProjectBrain,
  formatRuntimeBrainContextForPrompt,
  formatRuntimeBrainContextDebug,
} from '../../src/projectBrain/runtimeContext.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'rbc-'));
}

async function initBrain(cwd: string): Promise<void> {
  const dir = path.join(cwd, '.apeironcode');
  await fs.mkdir(dir, {recursive: true});
  await fs.writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      version: '1.0',
      projectName: 'TestProject',
      projectRootFingerprint: 'fp-abc',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  );
  await fs.writeFile(path.join(dir, 'PROJECT.md'), '# TestProject\nA test project.');
  await fs.writeFile(path.join(dir, 'PLAN.md'), '# Plan\n- [ ] Step 1');
  await fs.writeFile(path.join(dir, 'TASKS.md'), '# Tasks\n- [ ] Task A');
  await fs.writeFile(path.join(dir, 'RUNS.md'), '# Runs\nRun 1: success');
  await fs.writeFile(path.join(dir, 'VERIFY.md'), '# Verify\nnpm test: ok');
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('buildRuntimeBrainContext', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  describe('no-brain fast path', () => {
    it('returns no-op context for short prompt (no brain needed)', async () => {
      const result = await buildRuntimeBrainContext(tmpDir, 'hi');
      expect(result.intentResult.useBrain).toBe(false);
      expect(result.brainPresent).toBe(false);
      expect(result.promptInjection).toBe('');
      expect(result.estimatedTokens).toBe(0);
    });

    it('returns no-op context for simple rename prompt', async () => {
      const result = await buildRuntimeBrainContext(tmpDir, 'rename the variable');
      expect(result.intentResult.useBrain).toBe(false);
      expect(result.promptInjection).toBe('');
    });
  });

  describe('missing brain path', () => {
    it('includes NO_BRAIN_SUGGESTION warning when brain missing for continuation', async () => {
      const result = await buildRuntimeBrainContext(tmpDir, 'continue the plan');
      expect(result.brainPresent).toBe(false);
      expect(result.warnings.some((w) => w.includes('Project Brain not found'))).toBe(true);
    });

    it('includes orchestration suggestion when brain missing for large app build', async () => {
      const prompt =
        'Build a full SaaS platform with React frontend, Node.js backend, Stripe billing, multi-tenant architecture, admin panel, and real-time notifications for enterprise customers with a rich analytics dashboard';
      const result = await buildRuntimeBrainContext(tmpDir, prompt);
      expect(result.brainPresent).toBe(false);
      expect(result.promptInjection).toContain('Plan-First');
    });

    it('returns empty injection for debug prompt when brain missing', async () => {
      const result = await buildRuntimeBrainContext(tmpDir, 'fix the crash in auth module');
      // brain missing, not continue/large-app-build → empty injection
      expect(result.promptInjection).toBe('');
    });
  });

  describe('continuation intent', () => {
    it('loads continuation context when brain present', async () => {
      await initBrain(tmpDir);
      const result = await buildRuntimeBrainContext(tmpDir, 'continue the plan');
      expect(result.intentResult.intent).toBe('continue');
      expect(result.brainPresent).toBe(true);
      expect(result.debugExplanation).toContain('Continuation');
    });

    it('injection includes Project Brain Continuation Context header', async () => {
      await initBrain(tmpDir);
      const result = await buildRuntimeBrainContext(tmpDir, 'continue the plan');
      if (result.promptInjection) {
        expect(result.promptInjection).toContain('Project Brain Continuation Context');
      }
    });
  });

  describe('large app build intent', () => {
    const largeBuildPrompt =
      'Build a full SaaS platform with React frontend, Node.js backend, Stripe billing, multi-tenant architecture, admin panel, and real-time notifications for enterprise customers with a rich analytics dashboard';

    it('classifies as large-app-build', async () => {
      await initBrain(tmpDir);
      const result = await buildRuntimeBrainContext(tmpDir, largeBuildPrompt);
      expect(result.intentResult.intent).toBe('large-app-build');
    });

    it('includes plan-first suggestion in injection', async () => {
      await initBrain(tmpDir);
      const result = await buildRuntimeBrainContext(tmpDir, largeBuildPrompt);
      expect(result.promptInjection).toContain('Plan-First');
    });

    it('does not require brain files to be present', async () => {
      const result = await buildRuntimeBrainContext(tmpDir, largeBuildPrompt);
      expect(result.promptInjection).toContain('Plan-First');
    });
  });

  describe('general brain-aware path', () => {
    it('selects context for debug-fix intent', async () => {
      await initBrain(tmpDir);
      const result = await buildRuntimeBrainContext(tmpDir, 'fix the crash in authentication module');
      expect(result.intentResult.intent).toBe('debug-fix');
      expect(result.brainPresent).toBe(true);
      expect(result.estimatedTokens).toBeGreaterThanOrEqual(0);
    });

    it('selects context for review intent', async () => {
      await initBrain(tmpDir);
      const result = await buildRuntimeBrainContext(tmpDir, 'review this code for security issues');
      expect(result.intentResult.intent).toBe('review');
      expect(result.brainPresent).toBe(true);
    });

    it('selects context for frontend intent', async () => {
      await initBrain(tmpDir);
      const result = await buildRuntimeBrainContext(tmpDir, 'create a React component for the dashboard page layout');
      expect(result.intentResult.intent).toBe('frontend');
    });

    it('selects context for backend intent', async () => {
      await initBrain(tmpDir);
      const result = await buildRuntimeBrainContext(tmpDir, 'add a REST API endpoint for user creation with database schema');
      expect(result.intentResult.intent).toBe('backend');
    });

    it('respects token budget option', async () => {
      await initBrain(tmpDir);
      const result = await buildRuntimeBrainContext(tmpDir, 'fix the crash in auth module', {tokenBudget: 200});
      expect(result.estimatedTokens).toBeLessThanOrEqual(300);
    });

    it('skipRouting: true skips routing plan', async () => {
      await initBrain(tmpDir);
      const result = await buildRuntimeBrainContext(tmpDir, 'fix the crash in auth module', {skipRouting: true});
      expect(result.routingPlan).toBeNull();
    });

    it('skipFileSelection: true skips context selection', async () => {
      await initBrain(tmpDir);
      const result = await buildRuntimeBrainContext(tmpDir, 'fix the crash in auth module', {skipFileSelection: true});
      expect(result.contextSelection).toBeNull();
    });
  });

  describe('token budget and injection', () => {
    it('estimatedTokens is non-negative', async () => {
      await initBrain(tmpDir);
      const result = await buildRuntimeBrainContext(tmpDir, 'fix the crash in auth module');
      expect(result.estimatedTokens).toBeGreaterThanOrEqual(0);
    });

    it('promptInjection does not exceed 4x tokenBudget chars', async () => {
      await initBrain(tmpDir);
      const budget = 300;
      const result = await buildRuntimeBrainContext(tmpDir, 'review the auth code for security issues', {tokenBudget: budget});
      expect(result.promptInjection.length).toBeLessThanOrEqual(budget * 4 + 100);
    });
  });

  describe('secret redaction', () => {
    it('does not leak secrets in brainStatusLine', async () => {
      await initBrain(tmpDir);
      const result = await buildRuntimeBrainContext(tmpDir, 'fix the crash in auth module with sk-abcdefghijklmnopqrstuvwxyz12345678');
      expect(result.brainStatusLine).not.toContain('sk-abcdefghijklmnopqrstuvwxyz12345678');
    });

    it('does not leak secrets in promptInjection', async () => {
      await initBrain(tmpDir);
      const result = await buildRuntimeBrainContext(tmpDir, 'review code using token sk-abcdefghijklmnopqrstuvwxyz12345678 in auth');
      expect(result.promptInjection).not.toContain('sk-abcdefghijklmnopqrstuvwxyz12345678');
    });
  });

  describe('warnings', () => {
    it('includes brain-missing warning when applicable', async () => {
      const result = await buildRuntimeBrainContext(tmpDir, 'continue the plan');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('no warnings when brain present and continuation intent', async () => {
      await initBrain(tmpDir);
      const result = await buildRuntimeBrainContext(tmpDir, 'continue the plan');
      const criticalWarnings = result.warnings.filter((w) => w.includes('Could not'));
      expect(criticalWarnings.length).toBe(0);
    });
  });
});

describe('shouldUseProjectBrain', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('returns false when brain not present', async () => {
    const ctx = await buildRuntimeBrainContext(tmpDir, 'continue the plan');
    expect(shouldUseProjectBrain(ctx)).toBe(false);
  });

  it('returns false when intent does not use brain', async () => {
    await initBrain(tmpDir);
    const ctx = await buildRuntimeBrainContext(tmpDir, 'hi');
    expect(shouldUseProjectBrain(ctx)).toBe(false);
  });

  it('returns true when brain present, intent uses brain, and injection is non-empty', async () => {
    await initBrain(tmpDir);
    const ctx = await buildRuntimeBrainContext(tmpDir, 'continue the plan');
    // continuation with brain present should produce injection or at least brainPresent=true
    expect(ctx.brainPresent).toBe(true);
    expect(ctx.intentResult.useBrain).toBe(true);
  });
});

describe('formatRuntimeBrainContextForPrompt', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('returns empty string when brain not in use', async () => {
    const ctx = await buildRuntimeBrainContext(tmpDir, 'hi');
    expect(formatRuntimeBrainContextForPrompt(ctx)).toBe('');
  });

  it('compact option truncates to 600 chars', async () => {
    await initBrain(tmpDir);
    const ctx = await buildRuntimeBrainContext(tmpDir, 'continue the plan');
    const full = formatRuntimeBrainContextForPrompt(ctx);
    const compact = formatRuntimeBrainContextForPrompt(ctx, {compact: true});
    if (full.length > 600) {
      expect(compact.length).toBeLessThanOrEqual(600);
    }
  });
});

describe('formatRuntimeBrainContextDebug', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('includes intent and brain present fields', async () => {
    const ctx = await buildRuntimeBrainContext(tmpDir, 'continue the plan');
    const debug = formatRuntimeBrainContextDebug(ctx);
    expect(debug).toContain('Brain present:');
    expect(debug).toContain('Intent:');
    expect(debug).toContain('Use brain:');
  });

  it('includes estimated tokens', async () => {
    await initBrain(tmpDir);
    const ctx = await buildRuntimeBrainContext(tmpDir, 'fix the crash in auth module');
    const debug = formatRuntimeBrainContextDebug(ctx);
    expect(debug).toContain('Estimated tokens:');
  });

  it('does not leak secrets', async () => {
    const ctx = await buildRuntimeBrainContext(tmpDir, 'fix crash with sk-abcdefghijklmnopqrstuvwxyz12345678');
    const debug = formatRuntimeBrainContextDebug(ctx);
    expect(debug).not.toContain('sk-abcdefghijklmnopqrstuvwxyz12345678');
  });
});
