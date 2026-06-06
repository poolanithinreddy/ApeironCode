import fs from 'node:fs/promises';
import path from 'node:path';
import type {MemoryEntity} from './graphTypes.js';

export interface VerificationCheck {
  kind: 'file_ref' | 'symbol_ref';
  ref: string;
  found: boolean;
  note?: string;
}

export interface VerificationResult {
  checks: VerificationCheck[];
  confidence: number;
  entityId: string;
  summary: string;
  verified: boolean;
}

const FILE_REF_PATTERNS: RegExp[] = [
  /\b(src\/[\w/.-]+\.\w+)\b/gu,
  /\b(tests?\/[\w/.-]+\.\w+)\b/gu,
  /\b([\w-]+\/[\w/.-]+\.(?:ts|js|tsx|jsx|py|go|java|md))\b/gu,
];

const extractFileRefs = (text: string): string[] => {
  const refs = new Set<string>();
  for (const re of FILE_REF_PATTERNS) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      if (match[1]) refs.add(match[1]);
    }
  }
  return [...refs];
};

const fileExists = async (p: string): Promise<boolean> => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

const verifyFileRef = async (ref: string, cwd: string): Promise<VerificationCheck> => {
  const absolute = path.isAbsolute(ref) ? ref : path.join(cwd, ref);
  const found = await fileExists(absolute);
  return {
    found,
    kind: 'file_ref',
    note: found ? undefined : `file not found: ${ref}`,
    ref,
  };
};

const metadataStringArray = (metadata: Record<string, unknown> | undefined, key: string): string[] => {
  const value = metadata?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
};

const adjustConfidence = (entity: MemoryEntity, checks: VerificationCheck[]): number => {
  if (checks.length === 0) return entity.confidence;
  const total = checks.length;
  const found = checks.filter((c) => c.found).length;
  const ratio = found / total;
  if (ratio === 1) return Math.min(entity.confidence + 0.05, 1.0);
  if (ratio === 0) return Math.max(entity.confidence - 0.2, 0.1);
  return Math.max(entity.confidence - 0.1 * (1 - ratio), 0.1);
};

export const verifyEntity = async (entity: MemoryEntity, cwd: string): Promise<VerificationResult> => {
  const textToScan = [entity.name, ...entity.observations].join('\n');
  const fileRefs = extractFileRefs(textToScan);
  const metadataRefs = [
    ...metadataStringArray(entity.metadata, 'relatedFiles'),
    ...metadataStringArray(entity.metadata, 'relatedTests'),
  ];

  const refs = Array.from(new Set([...fileRefs, ...metadataRefs]));
  const checks = await Promise.all(refs.map((ref) => verifyFileRef(ref, cwd)));

  const confidence = adjustConfidence(entity, checks);
  const verified = checks.length > 0 && checks.every((c) => c.found);
  const missing = checks.filter((c) => !c.found);
  const summary = checks.length === 0
    ? 'No file references found to verify.'
    : verified
      ? `Verified ${checks.length} referenced file(s).`
      : `Missing ${missing.length}/${checks.length} referenced file(s): ${missing.map((c) => c.ref).join(', ')}`;

  return {checks, confidence, entityId: entity.id, summary, verified};
};

export const verifyEntities = async (
  entities: MemoryEntity[],
  cwd: string,
): Promise<VerificationResult[]> => Promise.all(entities.map((e) => verifyEntity(e, cwd)));

export const applyVerificationResults = (
  entities: MemoryEntity[],
  results: VerificationResult[],
): MemoryEntity[] => {
  const byId = new Map(results.map((r) => [r.entityId, r]));
  return entities.map((entity) => {
    const result = byId.get(entity.id);
    if (!result) return entity;
    const metadata: Record<string, unknown> = {
      ...(entity.metadata ?? {}),
      verification: {
        checks: result.checks,
        summary: result.summary,
        verifiedAt: new Date().toISOString(),
      },
      verified: result.verified,
    };
    const markStale = result.checks.length > 0 && !result.verified && result.confidence < 0.5;
    return {
      ...entity,
      confidence: result.confidence,
      metadata,
      stale: markStale ? true : entity.stale,
    };
  });
};

export const filterUnverifiableRefs = (results: VerificationResult[]): VerificationResult[] =>
  results.filter((r) => r.checks.some((c) => !c.found));
