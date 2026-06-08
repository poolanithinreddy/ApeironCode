import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import {TextIndex} from './embeddings.js';
import type {MemoryEntity, MemoryGraph} from './graphTypes.js';
import {redactSecretLikeContent} from './safety.js';
import {isSuperseded} from './supersession.js';
import {ensureDirectory, fileExists, readJsonFile, readTextFile, writeTextFile} from '../utils/fs.js';
import {getProjectConfigDir} from '../utils/paths.js';

const SCHEMA_VERSION = 1;

interface IndexMetadata {
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  graphHash: string;
}

interface SerializedMemoryIndexFile {
  metadata: IndexMetadata;
  index: unknown;
}

const parseIndexFile = (content: string): SerializedMemoryIndexFile => {
  const parsed: unknown = JSON.parse(content);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid memory index file');
  }

  const candidate = parsed as {index?: unknown; metadata?: Partial<IndexMetadata>};
  if (!candidate.metadata || typeof candidate.metadata !== 'object' || candidate.index === undefined) {
    throw new Error('Invalid memory index file');
  }

  const metadata = candidate.metadata;
  if (
    typeof metadata.schemaVersion !== 'number'
    || typeof metadata.createdAt !== 'string'
    || typeof metadata.updatedAt !== 'string'
    || typeof metadata.graphHash !== 'string'
  ) {
    throw new Error('Invalid memory index metadata');
  }

  return {
    index: candidate.index,
    metadata: {
      createdAt: metadata.createdAt,
      graphHash: metadata.graphHash,
      schemaVersion: metadata.schemaVersion,
      updatedAt: metadata.updatedAt,
    },
  };
};

const entityToIndexText = (entity: MemoryEntity): string => {
  return redactSecretLikeContent([
    entity.type,
    entity.name,
    entity.tags.join(' '),
    entity.observations.join(' '),
    safeMetadataForIndex(entity.metadata),
  ].filter(Boolean).join('\n'));
};

const safeMetadataForIndex = (metadata: Record<string, unknown> | undefined): string => {
  if (!metadata) return '';
  const allowed: Record<string, unknown> = {};
  for (const key of ['subjectKey', 'sourceRef', 'verified', 'relatedFiles', 'relatedTests']) {
    if (metadata[key] !== undefined) allowed[key] = metadata[key];
  }
  return JSON.stringify(allowed);
};

export const getMemoryIndexPath = (cwd: string): string =>
  path.join(getProjectConfigDir(cwd), 'memory-index.json');

const getMemoryIndexBackupPath = (cwd: string): string =>
  path.join(getProjectConfigDir(cwd), 'memory-index.backup.json');

const getAdjacentMemoryGraphPath = (cwd: string): string =>
  path.join(getProjectConfigDir(cwd), 'memory', 'graph.json');

export const computeMemoryGraphHash = (graph: MemoryGraph): string => {
  const content = JSON.stringify({
    edges: graph.edges
      .map((edge) => ({
        confidence: edge.confidence,
        from: edge.from,
        id: edge.id,
        metadata: edge.metadata ?? {},
        to: edge.to,
        type: edge.type,
        updatedAt: edge.updatedAt,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    entities: graph.entities
      .map((entity) => ({
        confidence: entity.confidence,
        id: entity.id,
        metadata: entity.metadata ?? {},
        name: entity.name,
        observations: entity.observations,
        stale: Boolean(entity.stale),
        tags: entity.tags,
        type: entity.type,
        updatedAt: entity.updatedAt,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    schemaVersion: graph.schemaVersion,
  });
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
};

export class MemoryIndexStore {
  constructor(private readonly cwd: string) {}

  async load(): Promise<TextIndex> {
    const filePath = getMemoryIndexPath(this.cwd);
    if (!(await fileExists(filePath))) {
      return this.rebuildFromGraphIfPossible();
    }

    try {
      const content = await readTextFile(filePath);
      const parsed = parseIndexFile(content);

      if (parsed.metadata?.schemaVersion !== SCHEMA_VERSION) {
        return this.rebuildFromGraphIfPossible();
      }

      return TextIndex.deserialize(JSON.stringify(parsed.index));
    } catch {
      return this.tryBackupOrRebuild();
    }
  }

  async save(index: TextIndex): Promise<void> {
    const filePath = getMemoryIndexPath(this.cwd);
    const backupPath = getMemoryIndexBackupPath(this.cwd);
    await ensureDirectory(path.dirname(filePath));

    const graph = await this.loadGraphIfPossible();
    const existingMetadata = await this.loadExistingMetadata(filePath);
    const now = new Date().toISOString();
    const metadata: IndexMetadata = {
      schemaVersion: SCHEMA_VERSION,
      createdAt: existingMetadata?.createdAt ?? now,
      updatedAt: now,
      graphHash: computeMemoryGraphHash(graph),
    };

    const serializedIndex: unknown = JSON.parse(index.serialize());
    const toWrite = JSON.stringify({
      metadata,
      index: serializedIndex,
    }, null, 2);

    // Atomic write: write to temp, then rename
    const tempPath = `${filePath}.tmp`;
    try {
      // Create backup of existing file before writing
      if (await fileExists(filePath)) {
        try {
          const existing = await readTextFile(filePath);
          await writeTextFile(backupPath, existing);
        } catch {
          // Backup creation failed, continue anyway
        }
      }

      await writeTextFile(tempPath, `${toWrite}\n`);
      await fs.rename(tempPath, filePath);
    } catch {
      // Cleanup temp file if rename failed
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw new Error('Failed to save memory index');
    }
  }

  async rebuild(graph: MemoryGraph): Promise<TextIndex> {
    const index = new TextIndex();
    for (const entity of graph.entities) {
      if (entity.stale || isSuperseded(entity)) {
        continue;
      }
      index.add(entity.id, entityToIndexText(entity));
    }

    await this.save(index);
    return index;
  }

  async ensureCurrent(graph: MemoryGraph): Promise<TextIndex> {
    const filePath = getMemoryIndexPath(this.cwd);
    if (!(await fileExists(filePath))) {
      return this.rebuild(graph);
    }

    try {
      const content = await readTextFile(filePath);
      const parsed = parseIndexFile(content);
      const metadata = parsed.metadata;

      // Check for schema version mismatch
      if (metadata?.schemaVersion !== SCHEMA_VERSION) {
        return this.rebuild(graph);
      }

      // Check for graph hash mismatch (indicates graph changed)
      const currentGraphHash = computeMemoryGraphHash(graph);
      if (metadata?.graphHash !== currentGraphHash) {
        return this.rebuild(graph);
      }

      // Check file modification time vs graph updated time
      const stats = await fs.stat(filePath);
      const graphUpdatedAt = Number.isNaN(Date.parse(graph.updatedAt))
        ? 0
        : Date.parse(graph.updatedAt);
      if (stats.mtimeMs < graphUpdatedAt) {
        return this.rebuild(graph);
      }
    } catch {
      return this.rebuild(graph);
    }

    const index = await this.load();
    const activeEntityCount = graph.entities.filter((entity) => !entity.stale).length;
    if (activeEntityCount > 0 && index.size === 0) {
      return this.rebuild(graph);
    }

    return index;
  }

  private async tryBackupOrRebuild(): Promise<TextIndex> {
    const backupPath = getMemoryIndexBackupPath(this.cwd);
    if (await fileExists(backupPath)) {
      try {
        const content = await readTextFile(backupPath);
        const parsed = parseIndexFile(content);
        return TextIndex.deserialize(JSON.stringify(parsed.index));
      } catch {
        // Backup also corrupted, fall through to rebuild
      }
    }

    return this.rebuildFromGraphIfPossible();
  }

  private async loadExistingMetadata(filePath: string): Promise<IndexMetadata | null> {
    if (!(await fileExists(filePath))) {
      return null;
    }

    try {
      return parseIndexFile(await readTextFile(filePath)).metadata;
    } catch {
      return null;
    }
  }

  private async loadGraphIfPossible(): Promise<MemoryGraph> {
    const graphPath = getAdjacentMemoryGraphPath(this.cwd);
    if (!(await fileExists(graphPath))) {
      return {
        edges: [],
        entities: [],
        schemaVersion: 1,
        updatedAt: new Date(0).toISOString(),
      };
    }

    try {
      return await readJsonFile<MemoryGraph>(graphPath, {
        edges: [],
        entities: [],
        schemaVersion: 1,
        updatedAt: new Date(0).toISOString(),
      });
    } catch {
      return {
        edges: [],
        entities: [],
        schemaVersion: 1,
        updatedAt: new Date(0).toISOString(),
      };
    }
  }

  private async rebuildFromGraphIfPossible(): Promise<TextIndex> {
    const graph = await this.loadGraphIfPossible();
    if (!Array.isArray(graph.entities) || graph.entities.length === 0) {
      return new TextIndex();
    }

    return this.rebuild(graph);
  }
}
