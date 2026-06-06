import crypto from 'node:crypto';
import path from 'node:path';

import {createMemoryEntityId, redactMemoryText, upsertMemoryFact} from './graph.js';
import type {MemoryEntityType, MemoryFactInput} from './graphTypes.js';
import {MemoryGraphStore} from './graphStore.js';
import {ensureDirectory, fileExists, readTextFile, writeTextFile} from '../utils/fs.js';
import {getProjectConfigDir} from '../utils/paths.js';

export type MemorySuggestionSource = 'agent-run' | 'github' | 'manual' | 'skill' | 'team';
export type MemorySuggestionStatus = 'applied' | 'approved' | 'pending' | 'rejected';

export interface MemorySuggestion {
  confidence: 'high' | 'low' | 'medium';
  createdAt: string;
  entityType: MemoryEntityType;
  id: string;
  proposedFacts: MemoryFactInput[];
  redactionApplied: boolean;
  relatedFiles?: string[];
  relatedSessionId?: string;
  source: MemorySuggestionSource;
  status: MemorySuggestionStatus;
  summary: string;
}

export const getMemorySuggestionsPath = (cwd: string): string =>
  path.join(getProjectConfigDir(cwd), 'memory', 'suggestions.jsonl');

const createSuggestionId = (suggestion: Omit<MemorySuggestion, 'id'>): string => {
  const digest = crypto
    .createHash('sha256')
    .update(`${suggestion.createdAt}:${suggestion.source}:${suggestion.summary}`)
    .digest('hex')
    .slice(0, 12);
  return `memsug_${digest}`;
};

const redactFact = (fact: MemoryFactInput): {fact: MemoryFactInput; redacted: boolean} => {
  const name = redactMemoryText(fact.name);
  const observation = redactMemoryText(fact.observation);
  return {
    fact: {
      ...fact,
      name,
      observation,
    },
    redacted: name !== fact.name || observation !== fact.observation,
  };
};

export class MemorySuggestionStore {
  constructor(private readonly cwd: string) {}

  async list(): Promise<MemorySuggestion[]> {
    const filePath = getMemorySuggestionsPath(this.cwd);
    if (!(await fileExists(filePath))) {
      return [];
    }
    const raw = await readTextFile(filePath);
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as MemorySuggestion);
  }

  async append(input: {
    confidence?: MemorySuggestion['confidence'];
    proposedFacts: MemoryFactInput[];
    relatedFiles?: string[];
    relatedSessionId?: string;
    source: MemorySuggestionSource;
    summary: string;
  }): Promise<MemorySuggestion> {
    const redactedFacts = input.proposedFacts.map(redactFact);
    const createdAt = new Date().toISOString();
    const base: Omit<MemorySuggestion, 'id'> = {
      confidence: input.confidence ?? 'medium',
      createdAt,
      entityType: redactedFacts[0]?.fact.type ?? 'task',
      proposedFacts: redactedFacts.map((entry) => entry.fact),
      redactionApplied: redactedFacts.some((entry) => entry.redacted),
      relatedFiles: input.relatedFiles,
      relatedSessionId: input.relatedSessionId,
      source: input.source,
      status: 'pending',
      summary: redactMemoryText(input.summary),
    };
    const suggestion: MemorySuggestion = {
      ...base,
      id: createSuggestionId(base),
    };
    const filePath = getMemorySuggestionsPath(this.cwd);
    await ensureDirectory(path.dirname(filePath));
    const existing = await this.list();
    await writeTextFile(filePath, [...existing, suggestion].map((entry) => JSON.stringify(entry)).join('\n') + '\n');
    return suggestion;
  }

  async updateStatus(id: string, status: MemorySuggestionStatus): Promise<MemorySuggestion | null> {
    const suggestions = await this.list();
    let changed: MemorySuggestion | null = null;
    const next = suggestions.map((suggestion) => {
      if (suggestion.id !== id) {
        return suggestion;
      }
      changed = {...suggestion, status};
      return changed;
    });
    if (!changed) {
      return null;
    }
    await writeTextFile(getMemorySuggestionsPath(this.cwd), next.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
    return changed;
  }

  async apply(id: string): Promise<MemorySuggestion | null> {
    const suggestion = (await this.list()).find((entry) => entry.id === id);
    if (!suggestion) {
      return null;
    }
    let graph = await new MemoryGraphStore(this.cwd).load();
    for (const fact of suggestion.proposedFacts) {
      graph = upsertMemoryFact(graph, fact);
    }
    await new MemoryGraphStore(this.cwd).save(graph);
    await this.updateStatus(id, 'applied');
    return {...suggestion, status: 'applied'};
  }

  async applyAll(): Promise<number> {
    const pending = (await this.list()).filter((suggestion) => suggestion.status === 'pending' || suggestion.status === 'approved');
    for (const suggestion of pending) {
      await this.apply(suggestion.id);
    }
    return pending.length;
  }

  async reject(id: string): Promise<MemorySuggestion | null> {
    return this.updateStatus(id, 'rejected');
  }

  async rejectAll(): Promise<number> {
    const pending = (await this.list()).filter((suggestion) => suggestion.status === 'pending');
    for (const suggestion of pending) {
      await this.reject(suggestion.id);
    }
    return pending.length;
  }
}

export const buildSessionMemorySuggestion = (input: {
  finalMessage: string;
  filesChanged?: string[];
  goal: string;
  mode: string;
  sessionId: string;
  skillName?: string;
}): MemoryFactInput[] => [
  {
    confidence: 0.72,
    metadata: {
      filesChanged: input.filesChanged ?? [],
      mode: input.mode,
      sessionId: input.sessionId,
      skillName: input.skillName,
    },
    name: input.goal.slice(0, 120),
    observation: `Completed ${input.mode} task: ${input.finalMessage.slice(0, 400)}`,
    source: 'session',
    tags: ['suggested'],
    type: 'task',
  },
  ...(input.skillName
    ? [{
        confidence: 0.75,
        metadata: {sessionId: input.sessionId},
        name: input.skillName,
        observation: `Skill used for task: ${input.goal}`,
        source: 'session' as const,
        tags: ['skill', 'suggested'],
        type: 'skill' as const,
      }]
    : []),
];

export const formatMemorySuggestions = (suggestions: MemorySuggestion[]): string => {
  if (suggestions.length === 0) {
    return 'No memory suggestions recorded.';
  }
  return suggestions
    .map((suggestion) => [
      `${suggestion.id} | ${suggestion.status} | ${suggestion.confidence} | ${suggestion.source}`,
      `  ${suggestion.summary}`,
      `  facts=${suggestion.proposedFacts.length} type=${suggestion.entityType} redacted=${suggestion.redactionApplied ? 'yes' : 'no'}`,
    ].join('\n'))
    .join('\n');
};

export const formatMemorySuggestionDetail = (suggestion: MemorySuggestion | null): string => {
  if (!suggestion) {
    return 'Memory suggestion not found.';
  }
  return [
    `${suggestion.id} | ${suggestion.status} | ${suggestion.confidence} | ${suggestion.source}`,
    `Created: ${suggestion.createdAt}`,
    `Summary: ${suggestion.summary}`,
    `Related session: ${suggestion.relatedSessionId ?? 'none'}`,
    `Related files: ${suggestion.relatedFiles?.join(', ') || 'none'}`,
    `Redaction applied: ${suggestion.redactionApplied ? 'yes' : 'no'}`,
    '',
    'Proposed facts:',
    ...suggestion.proposedFacts.map((fact) => `- ${fact.type}:${createMemoryEntityId(fact.type, fact.name)} ${fact.name} — ${fact.observation}`),
  ].join('\n');
};
