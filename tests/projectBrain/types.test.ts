import {describe, expect, it} from 'vitest';

import {DEFAULT_PROJECT_BRAIN_FILES, type ProjectBrainManifest} from '../../src/projectBrain/types.js';

describe('Project Brain types', () => {
  it('keeps the default file list stable', () => {
    expect(DEFAULT_PROJECT_BRAIN_FILES.map((file) => file.relativePath)).toEqual([
      '.apeironcode/PROJECT.md',
      '.apeironcode/PLAN.md',
      '.apeironcode/TASKS.md',
      '.apeironcode/DECISIONS.md',
      '.apeironcode/REFERENCES.md',
      '.apeironcode/VERIFY.md',
      '.apeironcode/RUNS.md',
      '.apeironcode/MEMORY.md',
      '.apeironcode/manifest.json',
    ]);
  });

  it('serializes manifests without absolute paths or secrets', () => {
    const manifest: ProjectBrainManifest = {
      createdAt: '2026-01-01T00:00:00.000Z',
      files: [],
      notes: ['safe'],
      projectName: 'app',
      projectRootFingerprint: 'app-123456789abc',
      updatedAt: '2026-01-01T00:00:00.000Z',
      version: 1,
    };
    const raw = JSON.stringify(manifest);
    expect(JSON.parse(raw)).toEqual(manifest);
    expect(raw).not.toContain('/Users/');
    expect(raw).not.toMatch(/sk-[A-Za-z0-9_-]+/u);
  });
});
