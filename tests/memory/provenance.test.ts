import {describe, expect, it} from 'vitest';
import type {MemoryEntity} from '../../src/memory/graphTypes.js';
import {
  attachProvenanceToCandidate,
  buildProvenance,
  defaultProvenance,
  extractProvenanceFromEntity,
  isVerifiedProvenance,
  migrateEntityProvenance,
  provenanceSummary,
  redactEvidenceText,
  setProvenanceOnEntity,
} from '../../src/memory/provenance.js';
import type {MemoryCandidate} from '../../src/memory/writePolicy.js';

const makeEntity = (overrides: Partial<MemoryEntity> = {}): MemoryEntity => ({
  confidence: 0.8,
  createdAt: '2026-01-01T00:00:00Z',
  id: 'test-id',
  name: 'Test entity',
  observations: ['The service deploys via Cloud Run', 'Region is us-central1'],
  source: 'agent',
  tags: [],
  type: 'convention',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const makeCandidate = (overrides: Partial<MemoryCandidate> = {}): MemoryCandidate => ({
  confidence: 0.8,
  kind: 'project_fact',
  observation: 'The project uses vitest for unit testing',
  scope: 'project',
  source: 'agent',
  summary: 'Project uses vitest',
  tags: [],
  ...overrides,
});

describe('redactEvidenceText', () => {
  it('redacts GitHub tokens', () => {
    const text = 'Auth header: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
    expect(redactEvidenceText(text)).toContain('[REDACTED]');
    expect(redactEvidenceText(text)).not.toContain('ghp_');
  });

  it('redacts Bearer tokens', () => {
    const text = 'Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig';
    expect(redactEvidenceText(text)).toContain('[REDACTED]');
  });

  it('redacts key=value pairs', () => {
    const text = 'API_KEY=super-secret-value-here';
    expect(redactEvidenceText(text)).toContain('[REDACTED]');
  });

  it('redacts AWS access key IDs', () => {
    const text = 'AWS key: AKIAIOSFODNN7EXAMPLE';
    expect(redactEvidenceText(text)).toContain('[REDACTED]');
  });

  it('leaves normal text unchanged', () => {
    const text = 'The service uses Cloud Run for deployment';
    expect(redactEvidenceText(text)).toBe(text);
  });
});

describe('buildProvenance', () => {
  it('returns empty provenance with defaults when called with no args', () => {
    const p = buildProvenance();
    expect(p.evidence).toEqual([]);
    expect(p.verified).toBe(false);
    expect(p.sourceRef).toBeUndefined();
  });

  it('filters empty evidence items', () => {
    const p = buildProvenance({evidence: [{text: ''}, {text: '  '}, {text: 'valid evidence here'}]});
    expect(p.evidence).toHaveLength(1);
    expect(p.evidence[0]!.text).toBe('valid evidence here');
  });

  it('redacts secret-like content in evidence', () => {
    const p = buildProvenance({
      evidence: [{text: 'token=sk-ABC123DEFGHIJKLMNOPQRSTUVWXYZabcdefgh'}],
    });
    expect(p.evidence[0]!.text).toContain('[REDACTED]');
  });

  it('caps evidence length', () => {
    const p = buildProvenance({evidence: [{text: 'x'.repeat(1_000)}]});
    expect(p.evidence[0]!.text.length).toBeLessThanOrEqual(500);
  });

  it('sets sourceRef and verified fields', () => {
    const p = buildProvenance({
      sourceRef: 'src/services/deploy.ts',
      verified: true,
      verifiedAt: '2026-01-01T00:00:00Z',
      verifiedBy: 'user',
    });
    expect(p.sourceRef).toBe('src/services/deploy.ts');
    expect(p.verified).toBe(true);
    expect(p.verifiedAt).toBe('2026-01-01T00:00:00Z');
    expect(p.verifiedBy).toBe('user');
  });

  it('records related files and tests', () => {
    const p = buildProvenance({
      relatedFiles: ['src/memory/writePolicy.ts'],
      relatedTests: ['tests/memory/writePolicy.test.ts'],
    });
    expect(p.relatedFiles).toEqual(['src/memory/writePolicy.ts']);
    expect(p.relatedTests).toEqual(['tests/memory/writePolicy.test.ts']);
  });

  it('defaults evidence confidence to 0.7', () => {
    const p = buildProvenance({evidence: [{text: 'some evidence text here'}]});
    expect(p.evidence[0]!.confidence).toBe(0.7);
  });

  it('respects provided evidence confidence', () => {
    const p = buildProvenance({evidence: [{confidence: 0.9, text: 'high-confidence evidence'}]});
    expect(p.evidence[0]!.confidence).toBe(0.9);
  });
});

describe('defaultProvenance', () => {
  it('returns empty unverified provenance', () => {
    const p = defaultProvenance();
    expect(p.evidence).toEqual([]);
    expect(p.verified).toBe(false);
  });
});

describe('attachProvenanceToCandidate', () => {
  it('merges evidence texts into candidate', () => {
    const candidate = makeCandidate();
    const prov = buildProvenance({evidence: [{text: 'supporting observation from the codebase'}]});
    const result = attachProvenanceToCandidate(candidate, prov);
    expect(result.evidence).toContain('supporting observation from the codebase');
  });

  it('deduplicates evidence', () => {
    const candidate = makeCandidate({evidence: ['duplicate evidence item text here']});
    const prov = buildProvenance({evidence: [{text: 'duplicate evidence item text here'}]});
    const result = attachProvenanceToCandidate(candidate, prov);
    expect(result.evidence!.filter((e) => e === 'duplicate evidence item text here')).toHaveLength(1);
  });

  it('sets sourceRef from provenance when candidate lacks one', () => {
    const candidate = makeCandidate();
    const prov = buildProvenance({sourceRef: 'src/foo.ts'});
    const result = attachProvenanceToCandidate(candidate, prov);
    expect(result.sourceRef).toBe('src/foo.ts');
  });

  it('preserves existing candidate sourceRef', () => {
    const candidate = makeCandidate({sourceRef: 'src/original.ts'});
    const prov = buildProvenance({sourceRef: 'src/other.ts'});
    const result = attachProvenanceToCandidate(candidate, prov);
    expect(result.sourceRef).toBe('src/original.ts');
  });
});

describe('extractProvenanceFromEntity / setProvenanceOnEntity', () => {
  it('roundtrips provenance through entity metadata', () => {
    const entity = makeEntity();
    const prov = buildProvenance({
      evidence: [{text: 'Observed in deployment logs'}],
      relatedFiles: ['src/deploy.ts'],
      relatedTests: ['tests/deploy.test.ts'],
      sourceRef: 'src/deploy.ts',
      verified: true,
      verifiedAt: '2026-01-01T00:00:00Z',
      verifiedBy: 'user',
    });
    const updated = setProvenanceOnEntity(entity, prov);
    const extracted = extractProvenanceFromEntity(updated);
    expect(extracted.verified).toBe(true);
    expect(extracted.sourceRef).toBe('src/deploy.ts');
    expect(extracted.verifiedBy).toBe('user');
    expect(extracted.evidence).toHaveLength(1);
    expect(extracted.evidence[0]!.text).toBe('Observed in deployment logs');
    expect(extracted.relatedFiles).toEqual(['src/deploy.ts']);
    expect(extracted.relatedTests).toEqual(['tests/deploy.test.ts']);
  });

  it('returns default provenance when entity has no metadata', () => {
    const entity = makeEntity({metadata: undefined});
    const prov = extractProvenanceFromEntity(entity);
    expect(prov.verified).toBe(false);
    expect(prov.evidence).toEqual([]);
  });

  it('returns default provenance when metadata key is missing', () => {
    const entity = makeEntity({metadata: {other: 'data'}});
    const prov = extractProvenanceFromEntity(entity);
    expect(prov.verified).toBe(false);
  });

  it('preserves other metadata keys on setProvenanceOnEntity', () => {
    const entity = makeEntity({metadata: {custom: 42}});
    const updated = setProvenanceOnEntity(entity, defaultProvenance());
    expect(updated.metadata?.['custom']).toBe(42);
  });
});

describe('migrateEntityProvenance', () => {
  it('adds provenance from observations on entities without it', () => {
    const entity = makeEntity();
    const migrated = migrateEntityProvenance(entity);
    const prov = extractProvenanceFromEntity(migrated);
    expect(prov.evidence.length).toBeGreaterThan(0);
    expect(prov.evidence[0]!.text).toBe('The service deploys via Cloud Run');
  });

  it('does not overwrite existing provenance', () => {
    const entity = makeEntity();
    const prov = buildProvenance({verified: true, verifiedAt: '2026-01-01T00:00:00Z', verifiedBy: 'user'});
    const withProv = setProvenanceOnEntity(entity, prov);
    const migrated = migrateEntityProvenance(withProv);
    const extracted = extractProvenanceFromEntity(migrated);
    expect(extracted.verified).toBe(true);
  });

  it('caps migrated evidence at 3 items', () => {
    const entity = makeEntity({
      observations: ['obs1 text here', 'obs2 text here', 'obs3 text here', 'obs4 text here'],
    });
    const migrated = migrateEntityProvenance(entity);
    const prov = extractProvenanceFromEntity(migrated);
    expect(prov.evidence).toHaveLength(3);
  });

  it('skips secret-like observations during migration', () => {
    const entity = makeEntity({
      observations: ['ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456 is the token', 'normal safe observation here'],
    });
    const migrated = migrateEntityProvenance(entity);
    const prov = extractProvenanceFromEntity(migrated);
    expect(prov.evidence.every((e) => !e.text.includes('ghp_'))).toBe(true);
  });
});

describe('isVerifiedProvenance', () => {
  it('returns true only when verified and verifiedAt set', () => {
    expect(isVerifiedProvenance({evidence: [], verified: true, verifiedAt: '2026-01-01T00:00:00Z'})).toBe(true);
    expect(isVerifiedProvenance({evidence: [], verified: false, verifiedAt: '2026-01-01T00:00:00Z'})).toBe(false);
    expect(isVerifiedProvenance({evidence: [], verified: true})).toBe(false);
  });
});

describe('provenanceSummary', () => {
  it('describes verified provenance', () => {
    const p = buildProvenance({verified: true, verifiedBy: 'user'});
    expect(provenanceSummary(p)).toContain('verified by user');
  });

  it('describes sourceRef', () => {
    const p = buildProvenance({sourceRef: 'src/foo.ts'});
    expect(provenanceSummary(p)).toContain('src/foo.ts');
  });

  it('reports evidence count', () => {
    const p = buildProvenance({evidence: [{text: 'item one here'}, {text: 'item two here'}]});
    expect(provenanceSummary(p)).toContain('2 evidence item(s)');
  });

  it('returns fallback for empty provenance', () => {
    expect(provenanceSummary(defaultProvenance())).toBe('no provenance');
  });
});
