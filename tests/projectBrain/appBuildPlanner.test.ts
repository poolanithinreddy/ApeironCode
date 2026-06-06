import {describe, expect, it} from 'vitest';

import {
  detectLargeAppBuildIntent,
  createAppBuildPlan,
  formatAppBuildPlan,
  createBrainPlanFromAppBuildPrompt,
} from '../../src/projectBrain/appBuildPlanner.js';

const LARGE_PROMPT = `
Build a complete SaaS dashboard application for project management.
It should have user authentication, team workspaces, task tracking,
Kanban boards, real-time notifications, billing integration, and an API.
Use Next.js, TypeScript, Tailwind CSS, Prisma, and PostgreSQL.
Deploy to Vercel with GitHub Actions CI.
`.trim();

const SMALL_EDIT = 'Fix the null pointer in auth.ts';

describe('App Build Planner', () => {
  it('detects large app-build intent', () => {
    expect(detectLargeAppBuildIntent(LARGE_PROMPT)).toBe(true);
  });

  it('does not detect small edit prompts', () => {
    expect(detectLargeAppBuildIntent(SMALL_EDIT)).toBe(false);
  });

  it('does not detect short prompts', () => {
    expect(detectLargeAppBuildIntent('Build an app')).toBe(false);
  });

  it('creates phases and tasks', () => {
    const plan = createAppBuildPlan(LARGE_PROMPT);
    expect(plan.phases.length).toBeGreaterThan(2);
    for (const phase of plan.phases) {
      expect(phase.tasks.length).toBeGreaterThan(0);
      expect(phase.verificationSteps.length).toBeGreaterThan(0);
    }
  });

  it('detects stack from prompt', () => {
    const plan = createAppBuildPlan(LARGE_PROMPT);
    expect(plan.assumedStack.some((s) => s.includes('Next'))).toBe(true);
    expect(plan.assumedStack.some((s) => s.includes('TypeScript'))).toBe(true);
    expect(plan.assumedStack.some((s) => s.includes('Prisma'))).toBe(true);
  });

  it('includes a verification plan', () => {
    const plan = createAppBuildPlan(LARGE_PROMPT);
    const allVerif = plan.phases.flatMap((p) => p.verificationSteps);
    expect(allVerif.length).toBeGreaterThan(0);
  });

  it('suggests Project Brain but does not force it', () => {
    const plan = createAppBuildPlan(LARGE_PROMPT);
    expect(plan.suggestsProjectBrain).toBe(true);
    // formatted output does not init — just suggests
    const text = formatAppBuildPlan(plan);
    expect(text).toContain('brain plan');
  });

  it('formatAppBuildPlan does not contain secrets', () => {
    const plan = createAppBuildPlan(`${LARGE_PROMPT}\nuse api_key=sk-secrettoken12345678901234`);
    const text = formatAppBuildPlan(plan);
    expect(text).not.toContain('sk-secrettoken');
  });

  it('createBrainPlanFromAppBuildPrompt is deterministic shape', () => {
    const {plan, formatted, suggestsInit} = createBrainPlanFromAppBuildPrompt(LARGE_PROMPT);
    expect(plan.phases.length).toBeGreaterThan(0);
    expect(formatted).toContain('# App Build Plan');
    expect(suggestsInit).toBe(true);
  });
});
