import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import type {MemoryEntity} from '../../src/memory/graphTypes.js';
import {
  applyVerificationResults,
  filterUnverifiableRefs,
  verifyEntities,
  verifyEntity,
} from '../../src/memory/verification.js';

let tmpDir: string;

const makeEntity = (overrides: Partial<MemoryEntity> = {}): MemoryEntity => ({
  confidence: 0.8,
  createdAt: new Date().toISOString(),
  id: 'e1',
  name: 'Test entity',
  observations: ['some observation text'],
  source: 'agent',
  tags: [],
  type: 'convention',
  updatedAt: new Date().toISOString(),
  ...overrides,
});

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-verification-'));
  await fs.mkdir(path.join(tmpDir, 'src'), {recursive: true});
  await fs.writeFile(path.join(tmpDir, 'src', 'app.ts'), 'export {}');
  await fs.mkdir(path.join(tmpDir, 'tests'), {recursive: true});
  await fs.writeFile(path.join(tmpDir, 'tests', 'app.test.ts'), '// test');
});

afterEach(async () => {
  await fs.rm(tmpDir, {recursive: true, force: true});
});

describe('verifyEntity', () => {
  it('returns verified true when all file refs exist', async () => {
    const entity = makeEntity({
      name: 'App module',
      observations: ['main entry point is src/app.ts'],
    });
    const result = await verifyEntity(entity, tmpDir);
    expect(result.entityId).toBe('e1');
    expect(result.checks.length).toBeGreaterThan(0);
    expect(result.checks.every((c) => c.found)).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('returns verified false when file ref is missing', async () => {
    const entity = makeEntity({
      observations: ['implementation lives in src/missing-file.ts'],
    });
    const result = await verifyEntity(entity, tmpDir);
    expect(result.verified).toBe(false);
    expect(result.confidence).toBeLessThan(0.8);
  });

  it('returns no checks when no file refs are in text', async () => {
    const entity = makeEntity({
      name: 'Use terse responses',
      observations: ['user prefers concise output without trailing summaries'],
    });
    const result = await verifyEntity(entity, tmpDir);
    expect(result.checks).toHaveLength(0);
    expect(result.confidence).toBe(0.8);
    expect(result.verified).toBe(false);
  });

  it('includes file ref in checks', async () => {
    const entity = makeEntity({
      observations: ['builds from src/app.ts'],
    });
    const result = await verifyEntity(entity, tmpDir);
    expect(result.checks.some((c) => c.ref.includes('src/app.ts'))).toBe(true);
  });

  it('verifies related file metadata refs', async () => {
    const entity = makeEntity({
      metadata: {relatedFiles: ['src/app.ts'], relatedTests: ['tests/app.test.ts']},
      observations: ['metadata carries file evidence'],
    });
    const result = await verifyEntity(entity, tmpDir);
    expect(result.verified).toBe(true);
    expect(result.summary).toContain('Verified 2 referenced file');
  });

  it('summarizes missing refs without leaking file contents', async () => {
    const entity = makeEntity({
      observations: ['secret-bearing file reference src/missing-secret.ts'],
    });
    const result = await verifyEntity(entity, tmpDir);
    expect(result.summary).toContain('src/missing-secret.ts');
    expect(result.summary).not.toContain('some observation text');
  });
});

describe('verifyEntities', () => {
  it('processes multiple entities in parallel', async () => {
    const entities = [
      makeEntity({id: 'a', observations: ['entry is src/app.ts']}),
      makeEntity({id: 'b', observations: ['tests are in tests/app.test.ts']}),
      makeEntity({id: 'c', observations: ['missing is src/does-not-exist.ts']}),
    ];
    const results = await verifyEntities(entities, tmpDir);
    expect(results).toHaveLength(3);
    expect(results.find((r) => r.entityId === 'a')?.verified).toBe(true);
    expect(results.find((r) => r.entityId === 'b')?.verified).toBe(true);
    expect(results.find((r) => r.entityId === 'c')?.verified).toBe(false);
  });
});

describe('applyVerificationResults', () => {
  it('raises confidence for fully-verified entity', async () => {
    const entity = makeEntity({id: 'e1', observations: ['entry is src/app.ts']});
    const results = await verifyEntities([entity], tmpDir);
    const updated = applyVerificationResults([entity], results);
    const updatedEntity = updated[0]!;
    expect(updatedEntity.confidence).toBeGreaterThanOrEqual(0.8);
    expect(updatedEntity.metadata?.['verified']).toBe(true);
  });

  it('lowers confidence and marks stale for unverifiable entity', async () => {
    const entity = makeEntity({confidence: 0.7, id: 'e1', observations: ['entry is src/missing.ts']});
    const results = await verifyEntities([entity], tmpDir);
    const updated = applyVerificationResults([entity], results);
    const updatedEntity = updated[0]!;
    expect(updatedEntity.confidence).toBeLessThan(0.7);
    expect(updatedEntity.stale).toBe(true);
  });

  it('does not modify entities not in results', () => {
    const entity = makeEntity({id: 'x'});
    const updated = applyVerificationResults([entity], []);
    expect(updated[0]).toEqual(entity);
  });

  it('stores verification metadata', async () => {
    const entity = makeEntity({id: 'e1', observations: ['in src/app.ts']});
    const results = await verifyEntities([entity], tmpDir);
    const updated = applyVerificationResults([entity], results);
    expect(updated[0]?.metadata?.['verification']).toBeDefined();
  });
});

describe('filterUnverifiableRefs', () => {
  it('returns only results with missing refs', async () => {
    const entities = [
      makeEntity({id: 'good', observations: ['entry is src/app.ts']}),
      makeEntity({id: 'bad', observations: ['entry is src/ghost.ts']}),
    ];
    const results = await verifyEntities(entities, tmpDir);
    const unverifiable = filterUnverifiableRefs(results);
    expect(unverifiable.some((r) => r.entityId === 'bad')).toBe(true);
    expect(unverifiable.every((r) => r.entityId !== 'good')).toBe(true);
  });
});
