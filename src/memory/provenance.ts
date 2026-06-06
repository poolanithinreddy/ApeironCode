import type {MemoryEntity} from './graphTypes.js';
import type {MemoryCandidate} from './writePolicy.js';
import {containsSecretLikeContent, redactSecretLikeContent} from './safety.js';

export interface EvidenceItem {
  confidence: number;
  sourceRef?: string;
  text: string;
  timestamp: string;
}

export interface MemoryProvenance {
  evidence: EvidenceItem[];
  relatedFiles?: string[];
  relatedTests?: string[];
  sourceRef?: string;
  verified: boolean;
  verifiedAt?: string;
  verifiedBy?: string;
}

export interface BuildProvenanceOptions {
  evidence?: Array<{confidence?: number; sourceRef?: string; text: string}>;
  relatedFiles?: string[];
  relatedTests?: string[];
  sourceRef?: string;
  verified?: boolean;
  verifiedAt?: string;
  verifiedBy?: string;
}

const MAX_EVIDENCE_CHARS = 500;

const REDACT_PATTERNS: RegExp[] = [
  /(?:secret|password|token|key|api[_-]?key)\s*[=:]\s*\S+/giu,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gu,
  /ghp_[A-Za-z0-9]{20,}/gu,
  /sk-[A-Za-z0-9]{20,}/gu,
  /AKIA[A-Z0-9]{16}/gu,
  /-----BEGIN [A-Z ]+ KEY-----[\s\S]*?-----END [A-Z ]+ KEY-----/gu,
];

export const redactEvidenceText = (text: string): string => {
  let out = redactSecretLikeContent(text).replace(/\[REDACTED_SECRET\]/gu, '[REDACTED]');
  for (const re of REDACT_PATTERNS) {
    out = out.replace(re, '[REDACTED]');
    re.lastIndex = 0;
  }
  return out;
};

const capEvidenceText = (text: string): string => {
  const redacted = redactEvidenceText(text.trim()).replace(/\s+/gu, ' ');
  return redacted.length > MAX_EVIDENCE_CHARS
    ? `${redacted.slice(0, MAX_EVIDENCE_CHARS - 1)}…`
    : redacted;
};

const nowIso = (): string => new Date().toISOString();

export const buildProvenance = (options: BuildProvenanceOptions = {}): MemoryProvenance => {
  const evidence: EvidenceItem[] = (options.evidence ?? [])
    .filter((e) => e.text.trim().length > 0)
    .map((e) => ({
      confidence: e.confidence ?? 0.7,
      sourceRef: e.sourceRef,
      text: capEvidenceText(e.text),
      timestamp: nowIso(),
    }));

  return {
    evidence,
    relatedFiles: options.relatedFiles,
    relatedTests: options.relatedTests,
    sourceRef: options.sourceRef,
    verified: options.verified ?? false,
    verifiedAt: options.verifiedAt,
    verifiedBy: options.verifiedBy,
  };
};

export const defaultProvenance = (): MemoryProvenance => ({
  evidence: [],
  verified: false,
});

export const attachProvenanceToCandidate = (
  candidate: MemoryCandidate,
  provenance: MemoryProvenance,
): MemoryCandidate => {
  const safeEvidence = provenance.evidence.map((e) => redactEvidenceText(e.text));
  const existing = candidate.evidence ?? [];
  const merged = Array.from(new Set([...existing, ...safeEvidence])).filter(Boolean);
  return {
    ...candidate,
    evidence: merged,
    sourceRef: candidate.sourceRef ?? provenance.sourceRef,
  };
};

const PROVENANCE_KEY = 'provenance';

export const extractProvenanceFromEntity = (entity: MemoryEntity): MemoryProvenance => {
  const raw = entity.metadata?.[PROVENANCE_KEY];
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const p = raw as Record<string, unknown>;
    return {
      evidence: Array.isArray(p['evidence'])
        ? (p['evidence'] as EvidenceItem[]).filter((e) => typeof e?.text === 'string')
          .map((e) => ({...e, text: capEvidenceText(e.text)}))
        : [],
      relatedFiles: Array.isArray(p['relatedFiles']) ? (p['relatedFiles'] as unknown[]).filter((v): v is string => typeof v === 'string') : undefined,
      relatedTests: Array.isArray(p['relatedTests']) ? (p['relatedTests'] as unknown[]).filter((v): v is string => typeof v === 'string') : undefined,
      sourceRef: typeof p['sourceRef'] === 'string' ? p['sourceRef'] : undefined,
      verified: typeof p['verified'] === 'boolean' ? p['verified'] : false,
      verifiedAt: typeof p['verifiedAt'] === 'string' ? p['verifiedAt'] : undefined,
      verifiedBy: typeof p['verifiedBy'] === 'string' ? p['verifiedBy'] : undefined,
    };
  }
  return defaultProvenance();
};

export const setProvenanceOnEntity = (
  entity: MemoryEntity,
  provenance: MemoryProvenance,
): MemoryEntity => ({
  ...entity,
  metadata: {
    ...(entity.metadata ?? {}),
    [PROVENANCE_KEY]: provenance,
  },
});

export const migrateEntityProvenance = (entity: MemoryEntity): MemoryEntity => {
  if (entity.metadata?.[PROVENANCE_KEY]) return entity;
  const prov: MemoryProvenance = {
    evidence: entity.observations
      .filter((obs) => !containsSecretLikeContent(obs))
      .slice(0, 3)
      .map((obs) => ({
        confidence: entity.confidence,
        text: capEvidenceText(obs),
        timestamp: entity.updatedAt,
      })),
    sourceRef: undefined,
    verified: false,
  };
  return setProvenanceOnEntity(entity, prov);
};

export const isVerifiedProvenance = (provenance: MemoryProvenance): boolean =>
  provenance.verified && typeof provenance.verifiedAt === 'string';

export const provenanceSummary = (provenance: MemoryProvenance): string => {
  const parts: string[] = [];
  if (provenance.verified) {
    parts.push(`verified${provenance.verifiedBy ? ` by ${provenance.verifiedBy}` : ''}`);
  }
  if (provenance.sourceRef) parts.push(`source: ${provenance.sourceRef}`);
  if (provenance.relatedFiles?.length) parts.push(`${provenance.relatedFiles.length} related file(s)`);
  if (provenance.relatedTests?.length) parts.push(`${provenance.relatedTests.length} related test(s)`);
  if (provenance.evidence.length > 0) {
    parts.push(`${provenance.evidence.length} evidence item(s)`);
  }
  return parts.length > 0 ? parts.join(', ') : 'no provenance';
};
