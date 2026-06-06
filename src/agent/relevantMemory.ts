import {estimateTokensFromBytes} from '../context/budget.js';
import {TextIndex} from '../memory/embeddings.js';
import {createMemoryEntityId} from '../memory/graph.js';
import {getMemoryGraphPath, MemoryGraphStore} from '../memory/graphStore.js';
import type {MemoryEntity, MemoryEntityType} from '../memory/graphTypes.js';
import {
  computeFileRelevanceScore,
  computeRetrievalScore,
  extractMentionedFiles,
  shouldFilterRetrievedMemory,
  type MemoryRetrievalScore,
} from '../memory/retrieval.js';
import {redactSecretLikeContent} from '../memory/safety.js';
import {compressRelevantMemory, formatCompressedMemory} from '../memory/compressor.js';
import {isSuperseded} from '../memory/supersession.js';
import {inferKindFromEntityType} from '../memory/taxonomy.js';
import {planMemoryRetrieval, shouldIncludeEntity} from '../memory/retrievalPlanner.js';
import {indexProjectBrainForContext} from '../projectBrain/indexer.js';
import {fileExists} from '../utils/fs.js';
import type {GlobalMemory, LoadedMemoryReason, ProjectMemory} from './memoryManager.js';

type RelevantMemoryScope = 'global' | 'project' | 'project+global';

interface ScoredMemoryEntity {
  entity: MemoryEntity;
  retrievalScore: MemoryRetrievalScore;
  scope: 'global' | 'project';
  score: number;
}

export interface RelevantMemoryEntry {
  entity: MemoryEntity;
  reasons: string[];
  retrievalScore?: MemoryRetrievalScore;
  scope: RelevantMemoryScope;
  summary: string;
}

export interface RelevantMemory {
  content: string;
  entries: RelevantMemoryEntry[];
  reasons: LoadedMemoryReason[];
  report?: string;
  totalTokens: number;
}

interface BuildRelevantMemoryOptions {
  globalMemory: GlobalMemory | null;
  globalMemoryRoot: string;
  limit: number;
  maxTokens?: number;
  projectDir: string;
  projectMemory: ProjectMemory | null;
  prompt: string;
}

const DEFAULT_MEMORY_TOKEN_BUDGET = 2_000;

const normalizeText = (value: string): string => value.trim().replace(/\s+/gu, ' ');

const trimSummary = (value: string, maxLength = 160): string => {
  const normalized = normalizeText(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
};

const entityToIndexText = (entity: MemoryEntity): string => {
  return [
    entity.type,
    entity.name,
    entity.tags.join(' '),
    entity.observations.join(' '),
    JSON.stringify(entity.metadata ?? {}),
  ].filter(Boolean).join('\n');
};

const createStructuredEntity = (
  scope: 'global' | 'project',
  type: MemoryEntityType,
  name: string,
  observation: string,
  confidence = 0.8,
  tags: string[] = [],
): MemoryEntity => ({
  confidence,
  createdAt: new Date(0).toISOString(),
  id: createMemoryEntityId(type, name),
  metadata: {
    structuredMemoryScope: scope,
  },
  name,
  observations: [observation],
  source: 'user',
  tags,
  type,
  updatedAt: new Date(0).toISOString(),
});

const projectMemoryToEntities = (memory: ProjectMemory | null): MemoryEntity[] => {
  if (!memory) {
    return [];
  }

  return [
    memory.purpose
      ? createStructuredEntity('project', 'task', 'Project purpose', memory.purpose, 0.85, ['project-memory', 'purpose'])
      : null,
    memory.architecture
      ? createStructuredEntity('project', 'decision', 'Project architecture', memory.architecture, 0.82, ['project-memory', 'architecture'])
      : null,
    ...(memory.importantFiles ?? []).map((filePath) =>
      createStructuredEntity('project', 'file', filePath, 'Important project file.', 0.8, ['project-memory', 'important-file'])),
    ...(memory.importantCommands ?? []).map((command) =>
      createStructuredEntity('project', 'command', command, 'Important project command.', 0.8, ['project-memory', 'command'])),
    ...(memory.testCommand
      ? [createStructuredEntity('project', 'command', memory.testCommand, 'Primary project test command.', 0.88, ['project-memory', 'test-command'])]
      : []),
    ...(memory.buildCommand
      ? [createStructuredEntity('project', 'command', memory.buildCommand, 'Primary project build command.', 0.84, ['project-memory', 'build-command'])]
      : []),
    ...(memory.lintCommand
      ? [createStructuredEntity('project', 'command', memory.lintCommand, 'Primary project lint command.', 0.84, ['project-memory', 'lint-command'])]
      : []),
    ...(memory.conventions ?? []).map((convention) =>
      createStructuredEntity('project', 'convention', convention, 'Project coding convention.', 0.82, ['project-memory', 'convention'])),
    ...(memory.pitfalls ?? []).map((pitfall) =>
      createStructuredEntity('project', 'error', pitfall, 'Known project pitfall.', 0.8, ['project-memory', 'pitfall'])),
    ...((memory.recentErrors ?? []).map((item) =>
      createStructuredEntity(
        'project',
        'error',
        item.message,
        item.fix ? `Recent error with known fix: ${item.fix}` : 'Recent project error.',
        0.78,
        ['project-memory', 'recent-error'],
      ))),
    ...(memory.userPreferences ?? []).map((preference) =>
      createStructuredEntity('project', 'user_preference', preference, 'Project-specific user preference.', 0.8, ['project-memory', 'preference'])),
  ].filter((entity): entity is MemoryEntity => Boolean(entity));
};

const projectBrainToEntities = async (projectDir: string): Promise<MemoryEntity[]> => {
  const chunks = await indexProjectBrainForContext(projectDir, {maxTokens: 700});
  return chunks.map((chunk) =>
    createStructuredEntity(
      'project',
      chunk.kind === 'verify' ? 'command' : chunk.kind === 'decisions' ? 'decision' : 'task',
      `Project Brain ${chunk.kind}`,
      chunk.content,
      0.86,
      ['project-brain', chunk.kind],
    ));
};

const globalMemoryToEntities = (memory: GlobalMemory | null): MemoryEntity[] => {
  if (!memory) {
    return [];
  }

  return [
    memory.codingStyle
      ? createStructuredEntity('global', 'user_preference', 'Coding style', memory.codingStyle, 0.88, ['global-memory', 'style'])
      : null,
    memory.testStrategy
      ? createStructuredEntity('global', 'user_preference', 'Test strategy', memory.testStrategy, 0.86, ['global-memory', 'testing'])
      : null,
    memory.explanationStyle
      ? createStructuredEntity('global', 'user_preference', 'Explanation style', memory.explanationStyle, 0.82, ['global-memory', 'explanation'])
      : null,
    ...(memory.commitStyle
      ? [createStructuredEntity('global', 'user_preference', 'Commit style', memory.commitStyle, 0.84, ['global-memory', 'commit-style'])]
      : []),
    ...(memory.preferredProviders ?? []).map((provider) =>
      createStructuredEntity('global', 'provider', provider, 'Preferred provider.', 0.84, ['global-memory', 'provider'])),
    ...(Object.entries(memory.preferredModels ?? {}).map(([role, model]) =>
      createStructuredEntity('global', 'model', model, `Preferred model for ${role}.`, 0.84, ['global-memory', 'model', role]))),
    ...(memory.customRules ?? []).map((rule) =>
      createStructuredEntity('global', 'convention', rule, 'Global custom rule.', 0.82, ['global-memory', 'rule'])),
  ].filter((entity): entity is MemoryEntity => Boolean(entity));
};

const searchStructuredEntities = (
  entities: MemoryEntity[],
  prompt: string,
  scope: 'global' | 'project',
  topK: number,
): ScoredMemoryEntity[] => {
  const index = new TextIndex();
  for (const entity of entities) {
    index.add(entity.id, entityToIndexText(entity));
  }

  const lexicalResults = index.query(prompt, Math.max(topK * 4, topK));
  const maxLexicalScore = Math.max(...lexicalResults.map((entry) => entry.score), 1);
  const scores = new Map(lexicalResults.map((entry) => [entry.id, entry.score / maxLexicalScore]));
  const mentionedFiles = extractMentionedFiles(prompt);
  const promptLower = prompt.toLowerCase();

  for (const entity of entities) {
    if (scores.has(entity.id)) continue;

    const entityText = entityToIndexText(entity).toLowerCase();
    if (computeFileRelevanceScore(entity, mentionedFiles) > 0) {
      scores.set(entity.id, 0.55);
    } else if (
      entity.type === 'convention'
      && /\b(tests?|specs?|fix|debug|review|lint)\b/u.test(promptLower)
      && /\b(tests?|specs?|targeted|review|lint|debug)\b/u.test(entityText)
    ) {
      scores.set(entity.id, 0.8);
    } else if (
      entity.type === 'command'
      && /\b(tests?|specs?|failing|lint|build)\b/u.test(promptLower)
      && entity.tags.some((tag) => ['test-command', 'lint-command', 'build-command'].includes(tag))
    ) {
      scores.set(entity.id, 0.8);
    }
  }

  return entities
    .filter((entity) => scores.has(entity.id))
    .map((entity) => {
      const retrievalScore = computeRetrievalScore(entity, scores.get(entity.id) ?? 0, {
        mentionedFiles,
        query: prompt,
      });
      return {
        entity,
        retrievalScore,
        scope,
        score: retrievalScore.finalScore,
      };
    })
    .filter((candidate) => !shouldFilterRetrievedMemory(candidate.entity, candidate.retrievalScore))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.entity.id.localeCompare(right.entity.id);
    })
    .slice(0, topK);
};

const searchGraphEntities = async (
  cwd: string,
  prompt: string,
  scope: 'global' | 'project',
  topK: number,
): Promise<ScoredMemoryEntity[]> => {
  const results = await new MemoryGraphStore(cwd).searchWithScores(prompt, {topK});
  return results.map((result) => ({
    entity: result.entity,
    retrievalScore: result.score,
    scope,
    score: result.score.finalScore,
  }));
};

const mergeScope = (
  left: RelevantMemoryScope,
  right: RelevantMemoryScope,
): RelevantMemoryScope => {
  if (left === right) {
    return left;
  }
  return 'project+global';
};

const formatEntrySummary = (entity: MemoryEntity): string => {
  if (entity.observations.length > 0) {
    return trimSummary(redactSecretLikeContent(entity.observations[0] ?? ''));
  }
  return trimSummary(redactSecretLikeContent(entity.name));
};

const formatRelevantMemoryEntry = (entry: RelevantMemoryEntry): string => {
  const reasons = entry.reasons.length > 0
    ? ` (${entry.reasons.slice(0, 2).join('; ')})`
    : '';
  return `- [${entry.scope}] ${entry.entity.type}: ${trimSummary(redactSecretLikeContent(entry.entity.name), 80)} - ${redactSecretLikeContent(entry.summary)}${reasons}`;
};

const buildReasons = (entries: RelevantMemoryEntry[]): LoadedMemoryReason[] => {
  const reasons: LoadedMemoryReason[] = [];
  const projectEntries = entries.filter((entry) => entry.scope === 'project' || entry.scope === 'project+global');
  const globalEntries = entries.filter((entry) => entry.scope === 'global' || entry.scope === 'project+global');

  if (projectEntries.length > 0) {
    reasons.push({
      reason: 'Loaded semantically relevant project memory from the local offline index.',
      source: 'project',
      summary: projectEntries.slice(0, 4).map((entry) => entry.entity.name).join('; '),
    });
  }

  if (globalEntries.length > 0) {
    reasons.push({
      reason: 'Loaded semantically relevant global memory from the local offline index.',
      source: 'global',
      summary: globalEntries.slice(0, 4).map((entry) => entry.entity.name).join('; '),
    });
  }

  return reasons;
};

export const buildRelevantMemory = async ({
  globalMemory,
  globalMemoryRoot,
  limit,
  maxTokens,
  projectDir,
  projectMemory,
  prompt,
}: BuildRelevantMemoryOptions): Promise<RelevantMemory> => {
  const plan = planMemoryRetrieval(prompt, {maxItems: limit});
  const memoryBudget = Math.min(maxTokens ?? DEFAULT_MEMORY_TOKEN_BUDGET, plan.maxTokens);
  const projectGraphResults = await searchGraphEntities(projectDir, prompt, 'project', 20);
  const projectBrainEntities = await projectBrainToEntities(projectDir);
  const projectStructuredResults = searchStructuredEntities([
    ...projectMemoryToEntities(projectMemory),
    ...projectBrainEntities,
  ], prompt, 'project', 20);

  const globalGraphResults = (await fileExists(getMemoryGraphPath(globalMemoryRoot)))
    ? await searchGraphEntities(globalMemoryRoot, prompt, 'global', 10)
    : [];
  const globalStructuredResults = searchStructuredEntities(globalMemoryToEntities(globalMemory), prompt, 'global', 10);

  const merged = new Map<string, {entry: RelevantMemoryEntry; score: number}>();
  for (const candidate of [
    ...projectGraphResults,
    ...projectStructuredResults,
    ...globalGraphResults,
    ...globalStructuredResults,
  ]) {
    const kind = inferKindFromEntityType(candidate.entity.type);
    if (!plan.scopes.includes(candidate.scope)) continue;
    if (!shouldIncludeEntity(kind, plan)) continue;
    if (candidate.entity.confidence < plan.minConfidence) continue;
    if (plan.excludeSuperseded && isSuperseded(candidate.entity)) continue;
    const scopeAdjustedScore = candidate.scope === 'project'
      ? candidate.score * 1.12
      : candidate.score * 0.85;
    const current = merged.get(candidate.entity.id);
    const nextEntry: RelevantMemoryEntry = {
      entity: current?.entry.entity ?? candidate.entity,
      reasons: current
        ? Array.from(new Set([...current.entry.reasons, ...candidate.retrievalScore.reasons]))
        : candidate.retrievalScore.reasons,
      retrievalScore: current?.entry.retrievalScore && current.entry.retrievalScore.finalScore > candidate.retrievalScore.finalScore
        ? current.entry.retrievalScore
        : candidate.retrievalScore,
      scope: current ? mergeScope(current.entry.scope, candidate.scope) : candidate.scope,
      summary: current?.entry.summary ?? formatEntrySummary(candidate.entity),
    };

    if (!current || scopeAdjustedScore > current.score) {
      merged.set(candidate.entity.id, {
        entry: nextEntry,
        score: scopeAdjustedScore,
      });
      continue;
    }

    merged.set(candidate.entity.id, {
      entry: nextEntry,
      score: current.score,
    });
  }

  const ranked = Array.from(merged.values())
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (right.entry.entity.confidence !== left.entry.entity.confidence) {
        return right.entry.entity.confidence - left.entry.entity.confidence;
      }
      return left.entry.entity.id.localeCompare(right.entry.entity.id);
    })
    .map((value) => value.entry);

  const selected: RelevantMemoryEntry[] = [];
  let totalTokens = 0;
  for (const entry of ranked) {
    const line = formatRelevantMemoryEntry(entry);
    const entryTokens = estimateTokensFromBytes(Buffer.byteLength(line, 'utf8'));
    if (selected.length > 0 && totalTokens + entryTokens > memoryBudget) {
      continue;
    }

    selected.push(entry);
    totalTokens += entryTokens;
    if (selected.length >= limit) {
      break;
    }
  }

  const compressed = compressRelevantMemory(
    selected.map((entry) => ({
      confidence: entry.entity.confidence,
      name: `[${entry.scope}] ${entry.entity.type}: ${entry.entity.name}`,
      observations: [
        entry.reasons.join(', '),
        entry.summary,
        ...entry.entity.observations,
      ].filter(Boolean),
      source: entry.scope,
      stale: entry.entity.stale,
      type: entry.entity.type,
    })),
    {
      includeMetadata: plan.taskType === 'architecture' || plan.taskType === 'debug' || plan.taskType === 'test_fix',
      maxTokens: Math.min(800, memoryBudget),
      prompt,
    },
  );
  const content = selected.length > 0
    ? formatCompressedMemory(compressed)
    : 'No relevant memory matched the current prompt.';

  return {
    content,
    entries: selected,
    reasons: buildReasons(selected),
    report: `memory: task=${plan.taskType}, selected=${selected.length}, tokens=${compressed.tokenEstimate}, budget=${memoryBudget}`,
    totalTokens: compressed.tokenEstimate || totalTokens,
  };
};
