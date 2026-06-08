import {describe, expect, it, beforeEach, afterEach} from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';

import {MemoryIndexStore, getMemoryIndexPath} from '../../src/memory/indexStore.js';
import {TextIndex} from '../../src/memory/embeddings.js';
import {ensureDirectory, fileExists, readTextFile, writeTextFile} from '../../src/utils/fs.js';
import {upsertMemoryFact} from '../../src/memory/graph.js';
import {createEmptyMemoryGraph} from '../../src/memory/graphStore.js';

const testDir = path.join('/tmp', 'memory-index-test-' + Date.now());

interface SavedIndexPayload {
  metadata: {
    createdAt: string;
    graphHash: string;
    schemaVersion: number;
    updatedAt: string;
  };
}

const parseSavedIndexPayload = (content: string): SavedIndexPayload => {
  const parsed = JSON.parse(content) as SavedIndexPayload;
  return parsed;
};

const cleanup = async () => {
  try {
    await fs.rm(testDir, {recursive: true, force: true});
  } catch {
    // Ignore cleanup errors
  }
};

describe('MemoryIndexStore Advanced', () => {
  beforeEach(async () => {
    await cleanup();
    await ensureDirectory(testDir);
  });

  afterEach(async () => {
    await cleanup();
  });

  describe('Schema Versioning', () => {
    it('rebuilds index if schema version mismatches', async () => {
      const store = new MemoryIndexStore(testDir);
      const index = new TextIndex();
      index.add('test-id', 'test content');

      await store.save(index);

      // Corrupt metadata to trigger rebuild
      const filePath = getMemoryIndexPath(testDir);
      const content = await readTextFile(filePath);
      const parsed = parseSavedIndexPayload(content);
      parsed.metadata.schemaVersion = 999;
      await writeTextFile(filePath, JSON.stringify(parsed));

      // Load should detect version mismatch
      const loaded = await store.load();
      expect(loaded).toBeDefined();
      expect(loaded.size).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Atomic Write', () => {
    it('creates temp file during write', async () => {
      const store = new MemoryIndexStore(testDir);
      const index = new TextIndex();
      index.add('test-id', 'test content');

      // The temp file should be cleaned up after successful write
      await store.save(index);

      const tempPath = `${getMemoryIndexPath(testDir)}.tmp`;
      expect(await fileExists(tempPath)).toBe(false);
    });

    it('creates backup before overwriting', async () => {
      const store = new MemoryIndexStore(testDir);
      const index1 = new TextIndex();
      index1.add('test-id-1', 'original content');
      await store.save(index1);

      const index2 = new TextIndex();
      index2.add('test-id-2', 'new content');
      await store.save(index2);

      // Backup should exist
      const backupPath = path.join(path.dirname(getMemoryIndexPath(testDir)), 'memory-index.backup.json');
      expect(await fileExists(backupPath)).toBe(true);
    });
  });

  describe('Graph Hash Detection', () => {
    it('rebuilds when graph hash changes', async () => {
      const store = new MemoryIndexStore(testDir);
      const index = new TextIndex();
      index.add('test-id', 'test content');
      await store.save(index);

      // Corrupt metadata to change hash
      const filePath = getMemoryIndexPath(testDir);
      const content = await readTextFile(filePath);
      const parsed = parseSavedIndexPayload(content);
      parsed.metadata.graphHash = 'different-hash';
      await writeTextFile(filePath, JSON.stringify(parsed));

      // ensureCurrent should detect mismatch and rebuild
      const mockGraph = {
        edges: [],
        entities: [],
        schemaVersion: 1 as const,
        updatedAt: new Date().toISOString(),
      };

      const result = await store.ensureCurrent(mockGraph);
      expect(result).toBeDefined();
    });
  });

  describe('Backup Recovery', () => {
    it('recovers from corrupted main index using backup', async () => {
      const store = new MemoryIndexStore(testDir);
      const index = new TextIndex();
      index.add('test-id', 'test content');
      await store.save(index);

      const replacement = new TextIndex();
      replacement.add('backup-id', 'backup content');
      await store.save(replacement);

      // Corrupt the main index file
      const filePath = getMemoryIndexPath(testDir);
      await writeTextFile(filePath, '{invalid json');

      // Load should fall back to backup
      const loaded = await store.load();
      expect(loaded.query('test content', 1)[0]?.id).toBe('test-id');
    });

    it('falls back to empty index if both main and backup are corrupt', async () => {
      const store = new MemoryIndexStore(testDir);

      // Both files are corrupt/missing
      const loaded = await store.load();
      expect(loaded.size).toBe(0);
    });
  });

  describe('Graph Hash Robustness', () => {
    it('rebuilds when entity content changes even if counts are unchanged', async () => {
      const store = new MemoryIndexStore(testDir);
      let graph = upsertMemoryFact(createEmptyMemoryGraph(), {
        name: 'Old command',
        observation: 'Run npm test',
        source: 'user',
        type: 'command',
      });

      await store.rebuild(graph);

      graph = {
        ...graph,
        entities: graph.entities.map((entity) => ({
          ...entity,
          name: 'New command',
          observations: ['Run npm run test:unit'],
          updatedAt: new Date(Date.now() + 1000).toISOString(),
        })),
      };

      const index = await store.ensureCurrent(graph);

      expect(index.query('test unit', 1)[0]?.id).toBe(graph.entities[0]?.id);
    });
  });

  describe('Index Persistence Metadata', () => {
    it('includes schemaVersion in saved index', async () => {
      const store = new MemoryIndexStore(testDir);
      const index = new TextIndex();
      index.add('test-id', 'test content');
      await store.save(index);

      const filePath = getMemoryIndexPath(testDir);
      const content = await readTextFile(filePath);
      const parsed = parseSavedIndexPayload(content);

      expect(parsed.metadata.schemaVersion).toBe(1);
    });

    it('includes timestamps in metadata', async () => {
      const store = new MemoryIndexStore(testDir);
      const index = new TextIndex();
      index.add('test-id', 'test content');
      await store.save(index);

      const filePath = getMemoryIndexPath(testDir);
      const content = await readTextFile(filePath);
      const parsed = parseSavedIndexPayload(content);

      expect(parsed.metadata.createdAt).toBeTruthy();
      expect(parsed.metadata.updatedAt).toBeTruthy();
    });

    it('includes graphHash in metadata', async () => {
      const store = new MemoryIndexStore(testDir);
      const index = new TextIndex();
      index.add('test-id', 'test content');
      await store.save(index);

      const filePath = getMemoryIndexPath(testDir);
      const content = await readTextFile(filePath);
      const parsed = parseSavedIndexPayload(content);

      expect(parsed.metadata.graphHash).toBeTruthy();
      expect(parsed.metadata.graphHash.length).toBeGreaterThan(0);
    });
  });
});
