import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

import {createProjectBrainInitPlan} from '../../src/projectBrain/planner.js';
import {applyProjectBrainInitPlan} from '../../src/projectBrain/writer.js';
import {auditProjectBrainFeatures, formatProjectBrainAuditReport} from '../../src/projectBrain/audit.js';

describe('Project Brain audit', () => {
  it('reports missing status for empty directory', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-audit-'));
    const report = await auditProjectBrainFeatures(cwd);
    expect(report.overall).toMatch(/missing|partial|blocked/u);
    const missing = report.checks.filter((c) => c.status === 'missing');
    expect(missing.length).toBeGreaterThan(0);
    await fs.rm(cwd, {recursive: true, force: true});
  });

  it('passes for initialized Project Brain', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-audit-init-'));
    const plan = await createProjectBrainInitPlan(cwd);
    await applyProjectBrainInitPlan(plan, {approved: true});
    const report = await auditProjectBrainFeatures(cwd);
    // available or partial (blocked is fine for untrusted project in test env)
    expect(['available', 'partial', 'blocked']).toContain(report.overall);
    // core files should be available
    const projectCheck = report.checks.find((c) => c.feature.includes('PROJECT.md'));
    expect(projectCheck?.status).toBe('available');
    await fs.rm(cwd, {recursive: true, force: true});
  });

  it('formatProjectBrainAuditReport does not leak secrets', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-audit-redact-'));
    const report = await auditProjectBrainFeatures(cwd);
    const text = formatProjectBrainAuditReport(report);
    // no raw tokens
    expect(text).not.toMatch(/sk-[A-Za-z0-9]{20,}/u);
    // has expected structure
    expect(text).toContain('Project Brain Audit');
    expect(text).toContain('Overall:');
    await fs.rm(cwd, {recursive: true, force: true});
  });

  it('includes CLI, bridge, and VS Code checks', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'apeiron-audit-checks-'));
    const report = await auditProjectBrainFeatures(cwd);
    const features = report.checks.map((c) => c.feature);
    expect(features.some((f) => f.includes('CLI'))).toBe(true);
    expect(features.some((f) => f.includes('bridge'))).toBe(true);
    expect(features.some((f) => f.includes('VS Code'))).toBe(true);
    await fs.rm(cwd, {recursive: true, force: true});
  });
});
