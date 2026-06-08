import type {MemoryEntity, MemoryEntityType} from './graphTypes.js';
import {containsSecretLikeContent, isMostlySecretMaterial} from './safety.js';
import {
  getMemoryKindSpec,
  inferKindFromEntityType,
  type MemoryKind,
  type MemoryScope,
} from './taxonomy.js';

export interface MemoryCandidate {
  confidence: number;
  evidence?: string[];
  kind: MemoryKind;
  observation: string;
  scope: MemoryScope;
  source: 'agent' | 'cli' | 'import' | 'session' | 'user';
  sourceRef?: string;
  summary: string;
  tags: string[];
}

export interface WriteDecision {
  candidate: MemoryCandidate;
  ok: boolean;
  reason: string;
  warnings?: string[];
}

const GENERIC_NAMES = new Set([
  'note', 'todo', 'fix', 'bug', 'thing', 'stuff', 'item',
  'feature', 'task', 'issue', 'project', 'code', 'file',
]);

const TEMPORARY_PHRASES = [
  /\bfor\s+now\b/iu,
  /\btemporar(?:y|ily)\b/iu,
  /\bjust\s+(?:trying|testing)\b/iu,
  /\bquick\s+fix\b/iu,
  /\bone[-\s]?off\b/iu,
];

const LOW_VALUE_PHRASES = [
  /\bthis\s+is\s+important\b/iu,
  /\bremember\s+this\b/iu,
  /\bkeep\s+this\s+in\s+mind\b/iu,
  /\buseful\s+later\b/iu,
];

const LOG_LINE_PATTERNS = [
  /^\s*(?:INFO|DEBUG|WARN|ERROR|TRACE)\b/u,
  /^\s*(?:PASS|FAIL|RUN|✓|×)\s/u,
  /^\s*at\s+[\w.<>]+/u,
  /^\s*\d+%\s/u,
];

const trimmedText = (candidate: MemoryCandidate): string =>
  `${candidate.summary} ${candidate.observation}`.trim();

const isGeneric = (candidate: MemoryCandidate): boolean => {
  const name = candidate.summary.trim().toLowerCase();
  if (GENERIC_NAMES.has(name)) return true;
  const text = trimmedText(candidate).toLowerCase();
  if (text.length < 24) return true;
  const words = text.split(/\s+/u).filter((w) => w.length > 2);
  if (words.length < 4) return true;
  const genericHits = words.filter((w) => GENERIC_NAMES.has(w)).length;
  return words.length > 0 && genericHits / words.length > 0.4;
};

const isTemporary = (candidate: MemoryCandidate): boolean => {
  const text = trimmedText(candidate);
  return TEMPORARY_PHRASES.some((re) => re.test(text));
};

const isGenericImportantPhrase = (candidate: MemoryCandidate): boolean => {
  const text = trimmedText(candidate);
  return LOW_VALUE_PHRASES.some((re) => re.test(text))
    && !/src\/|tests?\/|npm\s+run|because|decided|fixed|fails|provider|mcp|github|sandbox/iu.test(text);
};

const isRawLogOrHugeOutput = (candidate: MemoryCandidate): boolean => {
  const text = trimmedText(candidate);
  if (text.length > 4_000) return true;
  const lines = text.split(/\r?\n/u);
  if (lines.length < 8) return false;
  const logLike = lines.filter((line) => LOG_LINE_PATTERNS.some((re) => re.test(line))).length;
  return logLike / lines.length > 0.35;
};

const isDuplicateOf = (candidate: MemoryCandidate, existing: Pick<MemoryEntity, 'name' | 'observations'>): boolean => {
  const a = `${candidate.summary} ${candidate.observation}`.toLowerCase().replace(/\s+/gu, ' ').trim();
  const b = `${existing.name} ${existing.observations.join(' ')}`.toLowerCase().replace(/\s+/gu, ' ').trim();
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length > 24 && b.includes(a)) return true;
  if (b.length > 24 && a.includes(b)) return true;
  return false;
};

export interface ShouldWriteOptions {
  candidate: MemoryCandidate;
  existing?: ReadonlyArray<Pick<MemoryEntity, 'name' | 'observations'>>;
}

export const shouldWriteMemory = ({candidate, existing = []}: ShouldWriteOptions): WriteDecision => {
  const text = trimmedText(candidate);
  const warnings: string[] = [];
  if (!candidate.summary.trim()) {
    return {candidate, ok: false, reason: 'empty summary'};
  }
  if (text.length < 12) {
    return {candidate, ok: false, reason: 'too short'};
  }
  if (containsSecretLikeContent(text) || isMostlySecretMaterial(text)) {
    return {candidate, ok: false, reason: 'secret-like content'};
  }
  if (isRawLogOrHugeOutput(candidate)) {
    return {candidate, ok: false, reason: 'raw log or huge output'};
  }
  if (isGeneric(candidate)) {
    return {candidate, ok: false, reason: 'generic / low specificity'};
  }
  if (isGenericImportantPhrase(candidate)) {
    return {candidate, ok: false, reason: 'generic importance claim without evidence'};
  }
  if (isTemporary(candidate)) {
    return {candidate, ok: false, reason: 'temporary or one-off context'};
  }
  if (candidate.confidence < 0.3) {
    return {candidate, ok: false, reason: 'confidence below 0.3 floor'};
  }
  for (const item of existing) {
    if (isDuplicateOf(candidate, item)) {
      return {candidate, ok: false, reason: 'duplicate of existing memory'};
    }
  }
  if (candidate.source === 'agent' && (candidate.evidence?.length ?? 0) === 0 && !candidate.sourceRef) {
    warnings.push('agent-inferred memory has no explicit evidence; keep confidence conservative');
  }
  return {candidate, ok: true, reason: 'accepted', warnings: warnings.length > 0 ? warnings : undefined};
};

export interface ClassifyInput {
  observation: string;
  entityType?: MemoryEntityType;
  hintKind?: MemoryKind;
  source?: MemoryCandidate['source'];
  summary: string;
  tags?: string[];
}

const KIND_CUES: Array<{kind: MemoryKind; cue: RegExp}> = [
  {kind: 'user_preference', cue: /\b(?:i|user)\s+(?:prefer|like|always|never|want)\b/iu},
  {kind: 'convention', cue: /\b(?:convention|always\s+use|never\s+use|style\s+is|prefer\s+\w+\s+over)\b/iu},
  {kind: 'decision', cue: /\b(?:decided|chose|chosen|we\s+picked|going\s+with)\b/iu},
  {kind: 'pitfall', cue: /\b(?:gotcha|pitfall|sharp\s+edge|do\s+not|don['’]t|breaks?\s+when|silently\s+fails?)\b/iu},
  {kind: 'fix_recipe', cue: /\b(?:fix\s+is|fixed\s+by|workaround|to\s+resolve|rerun)\b/iu},
  {kind: 'command', cue: /^\s*(?:npm|yarn|pnpm|bun|make|cargo|mvn|gradle|go\s+\w+|python\s+|pytest)\b|^\s*npx\s+/iu},
  {kind: 'reference', cue: /\b(?:see|tracked\s+in|dashboard|grafana|linear|jira|notion)\b/iu},
  {kind: 'session_summary', cue: /\b(?:ran|session\s+\w+|completed|patched|applied)\s+\d/iu},
];

export const classifyMemoryCandidate = (input: ClassifyInput): MemoryCandidate => {
  const text = `${input.summary}\n${input.observation}`;
  let kind: MemoryKind | undefined = input.hintKind;
  if (!kind) {
    for (const {kind: k, cue} of KIND_CUES) {
      if (cue.test(text)) {
        kind = k;
        break;
      }
    }
  }
  if (!kind && input.entityType) {
    kind = inferKindFromEntityType(input.entityType);
  }
  if (!kind) kind = 'project_fact';
  const spec = getMemoryKindSpec(kind);
  const hasEvidence = text.includes('src/') || text.includes('tests/') || /\bnpm\s+run\b/u.test(text);
  const source = input.source ?? 'agent';
  const confidence = source === 'agent' && !hasEvidence
    ? Math.max(0.45, spec.defaultConfidence - 0.15)
    : spec.defaultConfidence;
  return {
    confidence,
    kind,
    observation: input.observation.trim(),
    scope: spec.defaultScope,
    source,
    summary: input.summary.trim(),
    tags: Array.from(new Set(input.tags ?? [])),
  };
};

export interface RunSignal {
  detail: string;
  kind: 'fix_applied' | 'failure' | 'decision' | 'preference' | 'command' | 'note';
  source?: string;
}

export interface ExtractFromRunInput {
  goal?: string;
  signals: RunSignal[];
  source?: MemoryCandidate['source'];
}

const MAX_OBSERVATION_BYTES = 500;
const truncate = (s: string, max = MAX_OBSERVATION_BYTES): string =>
  s.length > max ? `${s.slice(0, max - 1)}…` : s;

export const extractMemoryCandidateFromRun = (input: ExtractFromRunInput): MemoryCandidate[] => {
  const out: MemoryCandidate[] = [];
  for (const signal of input.signals) {
    const detail = signal.detail.trim();
    if (!detail) continue;
    let summary = '';
    let hintKind: MemoryKind | undefined;
    switch (signal.kind) {
      case 'fix_applied':
        summary = `Fix recipe: ${detail.split('\n')[0]?.slice(0, 80) ?? detail.slice(0, 80)}`;
        hintKind = 'fix_recipe';
        break;
      case 'decision':
        summary = `Decision: ${detail.slice(0, 80)}`;
        hintKind = 'decision';
        break;
      case 'preference':
        summary = `User preference: ${detail.slice(0, 80)}`;
        hintKind = 'user_preference';
        break;
      case 'command':
        summary = `Command: ${detail.slice(0, 80)}`;
        hintKind = 'command';
        break;
      case 'failure':
        summary = `Pitfall: ${detail.slice(0, 80)}`;
        hintKind = 'pitfall';
        break;
      case 'note':
      default:
        summary = detail.slice(0, 80);
        break;
    }
    out.push(
      classifyMemoryCandidate({
        hintKind,
        observation: truncate(detail),
        source: input.source ?? 'session',
        summary,
        tags: input.goal ? ['from-run', `goal:${input.goal.slice(0, 40)}`] : ['from-run'],
      }),
    );
  }
  return out;
};
