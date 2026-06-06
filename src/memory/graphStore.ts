import path from 'node:path';

import {readJsonFile, writeJsonFile} from '../utils/fs.js';
import {getProjectConfigDir} from '../utils/paths.js';
import {compactMemoryGraph} from './compaction.js';
import {MemoryIndexStore} from './indexStore.js';
import type {MemoryEntity, MemoryGraph, MemorySearchOptions} from './graphTypes.js';
import {
  computeFileRelevanceScore,
  computeRetrievalScore,
  extractMentionedFiles,
  shouldFilterRetrievedMemory,
  type MemoryRetrievalScore,
} from './retrieval.js';

export const createEmptyMemoryGraph = (): MemoryGraph => ({
  edges: [],
  entities: [],
  schemaVersion: 1,
  updatedAt: new Date().toISOString(),
});

export const getMemoryGraphPath = (cwd: string): string =>
  path.join(getProjectConfigDir(cwd), 'memory', 'graph.json');

export interface MemoryGraphSearchResult {
  entity: MemoryEntity;
  score: MemoryRetrievalScore;
}

export class MemoryGraphStore {
  constructor(private readonly cwd: string) {}

  async load(): Promise<MemoryGraph> {
    const graph = await readJsonFile<MemoryGraph>(getMemoryGraphPath(this.cwd), createEmptyMemoryGraph());
    return {
      ...createEmptyMemoryGraph(),
      ...graph,
      edges: Array.isArray(graph.edges) ? graph.edges : [],
      entities: Array.isArray(graph.entities) ? graph.entities : [],
      metadata: graph.metadata && typeof graph.metadata === 'object' ? graph.metadata : undefined,
      schemaVersion: 1,
    };
  }

  async save(graph: MemoryGraph): Promise<MemoryGraph> {
    const compacted = graph.entities.length > 1000
      ? compactMemoryGraph(graph, {
          maxEntities: 1000,
          minConfidence: 0.45,
          staleDays: 45,
        })
      : graph;

    const next: MemoryGraph = {
      ...graph,
      ...compacted,
      updatedAt: new Date().toISOString(),
    };
    await writeJsonFile(getMemoryGraphPath(this.cwd), next);
    await new MemoryIndexStore(this.cwd).rebuild(next);
    return next;
  }

  async search(query: string, options: MemorySearchOptions): Promise<MemoryEntity[]> {
    return (await this.searchWithScores(query, options)).map((result) => result.entity);
  }

  async searchWithScores(query: string, options: MemorySearchOptions): Promise<MemoryGraphSearchResult[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return [];
    }

    const graph = await this.load();
    const topK = Math.max(1, options.topK);
    const index = await new MemoryIndexStore(this.cwd).ensureCurrent(graph);
    const candidates = index.query(normalizedQuery, Math.max(topK * 8, topK, 40));

    const maxLexicalScore = candidates.length > 0
      ? Math.max(...candidates.map((candidate) => candidate.score), 1)
      : 1;
    const candidateScores = new Map(candidates.map((candidate) => [candidate.id, candidate.score / maxLexicalScore]));
    const allowedTypes = options.types ? new Set(options.types) : null;
    const entityById = new Map(graph.entities.map((entity) => [entity.id, entity]));
    const mentionedFiles = extractMentionedFiles(normalizedQuery);
    const now = Date.now();

    if (mentionedFiles.size > 0) {
      for (const entity of graph.entities) {
        if (!candidateScores.has(entity.id) && computeFileRelevanceScore(entity, mentionedFiles) > 0) {
          candidateScores.set(entity.id, 0.55);
        }
      }
    }

    return graph.entities
      .filter((entity) => candidateScores.has(entity.id))
      .filter((entity) => !allowedTypes || allowedTypes.has(entity.type))
      .map((entity) => ({
        entity,
        score: computeRetrievalScore(entity, candidateScores.get(entity.id) ?? 0, {
          allEntities: entityById,
          allRelations: graph.edges,
          mentionedFiles,
          now,
          options,
          query: normalizedQuery,
        }),
      }))
      .filter((result) => !shouldFilterRetrievedMemory(result.entity, result.score, options, now))
      .sort((left, right) => {
        if (right.score.finalScore !== left.score.finalScore) {
          return right.score.finalScore - left.score.finalScore;
        }
        if (right.entity.confidence !== left.entity.confidence) {
          return right.entity.confidence - left.entity.confidence;
        }
        return left.entity.id.localeCompare(right.entity.id);
      })
      .slice(0, topK);
  }
}
