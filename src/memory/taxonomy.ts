import type {MemoryEntityType} from './graphTypes.js';

export type MemoryKind =
  | 'user_preference'
  | 'project_fact'
  | 'convention'
  | 'decision'
  | 'pitfall'
  | 'fix_recipe'
  | 'command'
  | 'reference'
  | 'session_summary';

export type MemoryScope = 'global' | 'project' | 'session';

export type MemoryInjection = 'always' | 'on_relevance' | 'manual';

export interface MemoryKindSpec {
  defaultConfidence: number;
  defaultScope: MemoryScope;
  defaultTtlDays: number | null;
  description: string;
  examples: string[];
  injection: MemoryInjection;
  kind: MemoryKind;
  staleAfterDays: number | null;
}

const SPECS: Record<MemoryKind, MemoryKindSpec> = {
  user_preference: {
    defaultConfidence: 0.85,
    defaultScope: 'global',
    defaultTtlDays: null,
    description: 'A durable preference about how the user wants to collaborate.',
    examples: ['prefers terse responses', 'wants tests in vitest, not jest'],
    injection: 'always',
    kind: 'user_preference',
    staleAfterDays: 365,
  },
  project_fact: {
    defaultConfidence: 0.8,
    defaultScope: 'project',
    defaultTtlDays: 180,
    description: 'A factual statement about this project (purpose, structure, ownership).',
    examples: ['monorepo using npm workspaces', 'service deploys via Cloud Run'],
    injection: 'on_relevance',
    kind: 'project_fact',
    staleAfterDays: 90,
  },
  convention: {
    defaultConfidence: 0.8,
    defaultScope: 'project',
    defaultTtlDays: null,
    description: 'A coding/process convention enforced in this project.',
    examples: ['use path.posix in cross-platform code', 'snake_case for SQL columns'],
    injection: 'on_relevance',
    kind: 'convention',
    staleAfterDays: 180,
  },
  decision: {
    defaultConfidence: 0.85,
    defaultScope: 'project',
    defaultTtlDays: null,
    description: 'An architectural or implementation decision with rationale.',
    examples: ['chose Postgres over Mongo for transactional consistency'],
    injection: 'on_relevance',
    kind: 'decision',
    staleAfterDays: 365,
  },
  pitfall: {
    defaultConfidence: 0.7,
    defaultScope: 'project',
    defaultTtlDays: 180,
    description: 'A known sharp edge or recurring trap to avoid.',
    examples: ['vitest watch mode breaks coverage', 'do not edit dist/ directly'],
    injection: 'on_relevance',
    kind: 'pitfall',
    staleAfterDays: 120,
  },
  fix_recipe: {
    defaultConfidence: 0.7,
    defaultScope: 'project',
    defaultTtlDays: 90,
    description: 'A concrete recipe that resolved a recurring failure.',
    examples: ['rerun `npm run build` after touching tsup config'],
    injection: 'on_relevance',
    kind: 'fix_recipe',
    staleAfterDays: 60,
  },
  command: {
    defaultConfidence: 0.85,
    defaultScope: 'project',
    defaultTtlDays: null,
    description: 'A canonical command for this project (test/build/lint/run).',
    examples: ['npm run test:e2e validates end-to-end flows'],
    injection: 'on_relevance',
    kind: 'command',
    staleAfterDays: 180,
  },
  reference: {
    defaultConfidence: 0.7,
    defaultScope: 'project',
    defaultTtlDays: null,
    description: 'A pointer to where to find authoritative info (dashboard, doc, ticket).',
    examples: ['Linear project INGEST tracks pipeline bugs'],
    injection: 'manual',
    kind: 'reference',
    staleAfterDays: 365,
  },
  session_summary: {
    defaultConfidence: 0.5,
    defaultScope: 'session',
    defaultTtlDays: 14,
    description: 'A short summary of an in-progress or recent session.',
    examples: ['ran fix-tests workflow on 2026-05-08, 3 files patched'],
    injection: 'manual',
    kind: 'session_summary',
    staleAfterDays: 7,
  },
};

export const MEMORY_KIND_SPECS: ReadonlyArray<MemoryKindSpec> = Object.values(SPECS);

export const getMemoryKindSpec = (kind: MemoryKind): MemoryKindSpec => SPECS[kind];

export const isMemoryKind = (value: string): value is MemoryKind =>
  Object.prototype.hasOwnProperty.call(SPECS, value);

const ENTITY_TYPE_TO_KIND: Partial<Record<MemoryEntityType, MemoryKind>> = {
  command: 'command',
  convention: 'convention',
  decision: 'decision',
  fix: 'fix_recipe',
  user_preference: 'user_preference',
  bug: 'pitfall',
  error: 'pitfall',
  session: 'session_summary',
};

export const inferKindFromEntityType = (type: MemoryEntityType): MemoryKind =>
  ENTITY_TYPE_TO_KIND[type] ?? 'project_fact';

export const isMemoryStale = (
  kind: MemoryKind,
  updatedAt: string,
  now: number = Date.now(),
): boolean => {
  const spec = SPECS[kind];
  if (spec.staleAfterDays === null) return false;
  const ts = Date.parse(updatedAt);
  if (Number.isNaN(ts)) return false;
  const ageDays = (now - ts) / (24 * 60 * 60 * 1000);
  return ageDays > spec.staleAfterDays;
};

export const isMemoryExpired = (
  kind: MemoryKind,
  updatedAt: string,
  now: number = Date.now(),
): boolean => {
  const spec = SPECS[kind];
  if (spec.defaultTtlDays === null) return false;
  const ts = Date.parse(updatedAt);
  if (Number.isNaN(ts)) return false;
  const ageDays = (now - ts) / (24 * 60 * 60 * 1000);
  return ageDays > spec.defaultTtlDays;
};
