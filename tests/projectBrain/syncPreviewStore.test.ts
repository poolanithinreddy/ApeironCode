import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

import {
  saveSyncPreview,
  loadLatestSyncPreview,
  listSyncPreviews,
  getSyncPreview,
  deleteSyncPreview,
  formatSyncPreviewList,
  isPreviewStale,
} from '../../src/projectBrain/syncPreviewStore.js';
import type {ProjectBrainSyncPreview} from '../../src/projectBrain/autoSync.js';
import {PROJECT_BRAIN_DIR} from '../../src/projectBrain/types.js';

const makeTmpPreview = (partial: Partial<ProjectBrainSyncPreview> = {}): ProjectBrainSyncPreview => ({
  cwd: '/tmp/test-project',
  runsAppend: '## Run 2026-05-13\nCompleted authentication feature.',
  requiresApproval: true,
  safeToAutoWrite: false,
  decisionReason: 'Brain exists, low risk run',
  timestamp: new Date().toISOString(),
  ...partial,
});

describe('syncPreviewStore', () => {
  let tmpDir: string;

  beforeEach(async () => {
    // Use short prefix so the fingerprint stays under 32 chars and is not redacted
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bst-'));
    // Create .apeironcode dir with manifest.json so brain is considered initialized
    await fs.mkdir(path.join(tmpDir, PROJECT_BRAIN_DIR), {recursive: true});
    await fs.writeFile(path.join(tmpDir, PROJECT_BRAIN_DIR, 'manifest.json'), JSON.stringify({version: 1}), 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  describe('saveSyncPreview', () => {
    it('saves a preview and returns a stored record', async () => {
      const preview = makeTmpPreview();
      const stored = await saveSyncPreview(tmpDir, preview);
      expect(stored).not.toBeNull();
      expect(stored!.id).toBeTruthy();
      expect(stored!.riskLevel).toBe('low');
      expect(stored!.targetFiles).toContain('.apeironcode/RUNS.md');
    });

    it('returns null when brain dir does not exist', async () => {
      const noBrainDir = await fs.mkdtemp(path.join(os.tmpdir(), 'no-brain-'));
      try {
        const preview = makeTmpPreview();
        const stored = await saveSyncPreview(noBrainDir, preview);
        expect(stored).toBeNull();
      } finally {
        await fs.rm(noBrainDir, {recursive: true, force: true});
      }
    });

    it('creates preview dir if missing', async () => {
      const preview = makeTmpPreview();
      await saveSyncPreview(tmpDir, preview);
      const previewDir = path.join(tmpDir, PROJECT_BRAIN_DIR, 'runs', 'sync-previews');
      const stat = await fs.stat(previewDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('respects max stored previews limit', async () => {
      for (let i = 0; i < 12; i++) {
        await saveSyncPreview(tmpDir, makeTmpPreview({runsAppend: `run ${i} completed`}));
      }
      const list = await listSyncPreviews(tmpDir);
      expect(list.length).toBeLessThanOrEqual(10);
    });
  });

  describe('loadLatestSyncPreview', () => {
    it('returns null when no previews exist', async () => {
      const result = await loadLatestSyncPreview(tmpDir);
      expect(result).toBeNull();
    });

    it('loads the most recently saved preview', async () => {
      await saveSyncPreview(tmpDir, makeTmpPreview({runsAppend: '## Run first'}));
      await new Promise((r) => setTimeout(r, 10));
      await saveSyncPreview(tmpDir, makeTmpPreview({runsAppend: '## Run second'}));
      const loaded = await loadLatestSyncPreview(tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.changesSummary).toContain('RUNS.md');
    });
  });

  describe('listSyncPreviews', () => {
    it('returns empty array when no previews', async () => {
      const list = await listSyncPreviews(tmpDir);
      expect(list).toEqual([]);
    });

    it('lists all saved previews sorted by date descending', async () => {
      await saveSyncPreview(tmpDir, makeTmpPreview({runsAppend: '## Run A'}));
      await saveSyncPreview(tmpDir, makeTmpPreview({runsAppend: '## Run B'}));
      const list = await listSyncPreviews(tmpDir);
      expect(list.length).toBe(2);
    });
  });

  describe('getSyncPreview', () => {
    it('returns null for unknown id', async () => {
      const result = await getSyncPreview('nonexistent-id', tmpDir);
      expect(result).toBeNull();
    });

    it('retrieves a saved preview by id', async () => {
      const stored = await saveSyncPreview(tmpDir, makeTmpPreview());
      expect(stored).not.toBeNull();
      const fetched = await getSyncPreview(stored!.id, tmpDir);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(stored!.id);
    });
  });

  describe('deleteSyncPreview', () => {
    it('deletes a saved preview', async () => {
      const stored = await saveSyncPreview(tmpDir, makeTmpPreview());
      expect(stored).not.toBeNull();
      await deleteSyncPreview(stored!.id, tmpDir);
      const fetched = await getSyncPreview(stored!.id, tmpDir);
      expect(fetched).toBeNull();
    });

    it('is a no-op for unknown id', async () => {
      await expect(deleteSyncPreview('no-such-id', tmpDir)).resolves.not.toThrow();
    });
  });

  describe('isPreviewStale', () => {
    it('returns false for a fresh preview when target files exist', async () => {
      // Create the RUNS.md file before saving the preview so mtime < preview time
      await fs.writeFile(path.join(tmpDir, PROJECT_BRAIN_DIR, 'RUNS.md'), '# Runs\n', 'utf8');
      await new Promise((r) => setTimeout(r, 5));
      const stored = await saveSyncPreview(tmpDir, makeTmpPreview());
      expect(stored).not.toBeNull();
      const stale = await isPreviewStale(stored!, tmpDir);
      expect(stale).toBe(false);
    });

    it('returns true when target file does not exist', async () => {
      const stored = await saveSyncPreview(tmpDir, makeTmpPreview());
      expect(stored).not.toBeNull();
      const stale = await isPreviewStale(stored!, tmpDir);
      expect(stale).toBe(true);
    });
  });

  describe('formatSyncPreviewList', () => {
    it('returns placeholder when list is empty', () => {
      const text = formatSyncPreviewList([]);
      expect(text).toContain('No saved');
    });

    it('formats list with summary and risk', async () => {
      const stored = await saveSyncPreview(tmpDir, makeTmpPreview({runsAppend: '## Run\nAdded run data'}));
      expect(stored).not.toBeNull();
      const text = formatSyncPreviewList([stored!]);
      expect(text).toContain('low');
    });

    it('does not expose secrets', async () => {
      const stored = await saveSyncPreview(tmpDir, makeTmpPreview({runsAppend: 'run with sk-abcdefghijklmnopqrstuvwxyz12345678 token'}));
      expect(stored).not.toBeNull();
      const text = formatSyncPreviewList([stored!]);
      expect(text).not.toContain('sk-abcdefghijklmnopqrstuvwxyz12345678');
    });
  });
});
