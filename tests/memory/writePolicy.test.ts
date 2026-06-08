import {describe, expect, it} from 'vitest';
import {
  classifyMemoryCandidate,
  extractMemoryCandidateFromRun,
  shouldWriteMemory,
  type MemoryCandidate,
} from '../../src/memory/writePolicy.js';

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

describe('shouldWriteMemory', () => {
  it('accepts a well-formed candidate', () => {
    const result = shouldWriteMemory({candidate: makeCandidate()});
    expect(result.ok).toBe(true);
    expect(result.reason).toBe('accepted');
  });

  it('rejects empty summary', () => {
    const result = shouldWriteMemory({candidate: makeCandidate({summary: '  '})});
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('empty summary');
  });

  it('rejects too-short combined text', () => {
    const result = shouldWriteMemory({
      candidate: makeCandidate({summary: 'short', observation: 'ok'}),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('too short');
  });

  it('rejects secret-like content', () => {
    const result = shouldWriteMemory({
      candidate: makeCandidate({
        observation: 'token=ghp_ABC123DEFGHIJKLMNOPQRSTUVWXYZabc',
        summary: 'GitHub token used for authentication',
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('secret-like content');
  });

  it('rejects generic low-specificity candidates', () => {
    const result = shouldWriteMemory({
      candidate: makeCandidate({observation: 'fix the bug', summary: 'bug'}),
    });
    expect(result.ok).toBe(false);
  });

  it('rejects temporary/one-off candidates', () => {
    const result = shouldWriteMemory({
      candidate: makeCandidate({
        observation: 'this is just a quick fix for now until we refactor',
        summary: 'Temporary workaround for the build pipeline issue',
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('temporary or one-off context');
  });

  it('rejects generic importance claims without evidence', () => {
    const result = shouldWriteMemory({
      candidate: makeCandidate({
        observation: 'This is important, remember this for later.',
        summary: 'Important note',
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('generic importance claim without evidence');
  });

  it('rejects raw logs and huge outputs', () => {
    const log = Array.from({length: 20}, (_, i) => `ERROR failing stack line ${i}\n    at Object.fn${i} src/app.ts:${i}`).join('\n');
    const result = shouldWriteMemory({
      candidate: makeCandidate({
        observation: log,
        summary: 'Raw failing test output',
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('raw log or huge output');
  });

  it('warns for agent-inferred memory without evidence', () => {
    const result = shouldWriteMemory({
      candidate: makeCandidate({
        observation: 'Architecture decision: provider.stream replaced provider.chat for production providers.',
        summary: 'Provider stream architecture decision',
      }),
    });
    expect(result.ok).toBe(true);
    expect(result.warnings?.join(' ')).toContain('no explicit evidence');
  });

  it('rejects low-confidence candidates', () => {
    const result = shouldWriteMemory({candidate: makeCandidate({confidence: 0.1})});
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('confidence below 0.3 floor');
  });

  it('rejects duplicates of existing memories', () => {
    const candidate = makeCandidate({
      observation: 'The project uses vitest for unit testing',
      summary: 'Project uses vitest',
    });
    const existing = [{name: 'Project uses vitest', observations: ['The project uses vitest for unit testing']}];
    const result = shouldWriteMemory({candidate, existing});
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('duplicate of existing memory');
  });

  it('accepts candidate when existing memories are different', () => {
    const candidate = makeCandidate({
      observation: 'Deploys via Cloud Run in us-central1',
      summary: 'Deployment uses Cloud Run',
    });
    const existing = [{name: 'Project uses vitest', observations: ['The project uses vitest for unit testing']}];
    const result = shouldWriteMemory({candidate, existing});
    expect(result.ok).toBe(true);
  });
});

describe('classifyMemoryCandidate', () => {
  it('classifies user preference by cue', () => {
    const c = classifyMemoryCandidate({
      observation: 'I prefer terse responses without trailing summaries',
      summary: 'User prefers terse style',
    });
    expect(c.kind).toBe('user_preference');
    expect(c.scope).toBe('global');
  });

  it('classifies decision by cue', () => {
    const c = classifyMemoryCandidate({
      observation: 'We decided to use Postgres over Mongo for transactional consistency',
      summary: 'DB decision: Postgres',
    });
    expect(c.kind).toBe('decision');
  });

  it('classifies pitfall by cue', () => {
    const c = classifyMemoryCandidate({
      observation: "Do not edit dist/ directly — it gets overwritten on build",
      summary: 'Do not edit dist/',
    });
    expect(c.kind).toBe('pitfall');
  });

  it('classifies fix_recipe by cue', () => {
    const c = classifyMemoryCandidate({
      observation: 'Fix is to rerun npm run build after touching tsup config',
      summary: 'Fix recipe: rerun build',
    });
    expect(c.kind).toBe('fix_recipe');
  });

  it('falls back to hintKind over cue detection', () => {
    const c = classifyMemoryCandidate({
      hintKind: 'command',
      observation: 'npm run test:e2e validates end-to-end flows',
      summary: 'E2E test command',
    });
    expect(c.kind).toBe('command');
  });

  it('falls back to entity type inference', () => {
    const c = classifyMemoryCandidate({
      entityType: 'session',
      observation: 'Patched 3 files in the auth module',
      summary: 'Session summary',
    });
    expect(c.kind).toBe('session_summary');
  });

  it('defaults to project_fact when no cues match', () => {
    const c = classifyMemoryCandidate({
      observation: 'The monorepo has 5 packages under packages/',
      summary: 'Monorepo structure',
    });
    expect(c.kind).toBe('project_fact');
  });

  it('deduplicates tags', () => {
    const c = classifyMemoryCandidate({
      observation: 'Uses npm workspaces',
      summary: 'npm workspaces',
      tags: ['npm', 'npm', 'workspace'],
    });
    expect(c.tags).toEqual(['npm', 'workspace']);
  });
});

describe('extractMemoryCandidateFromRun', () => {
  it('converts fix_applied signal', () => {
    const [c] = extractMemoryCandidateFromRun({
      signals: [{detail: 'rerun npm run build after touching tsup config', kind: 'fix_applied'}],
    });
    expect(c).toBeDefined();
    expect(c!.kind).toBe('fix_recipe');
    expect(c!.summary).toMatch(/^Fix recipe:/);
  });

  it('converts decision signal', () => {
    const [c] = extractMemoryCandidateFromRun({
      signals: [{detail: 'chose Postgres over Mongo for transactional consistency', kind: 'decision'}],
    });
    expect(c!.kind).toBe('decision');
    expect(c!.summary).toMatch(/^Decision:/);
  });

  it('converts preference signal', () => {
    const [c] = extractMemoryCandidateFromRun({
      signals: [{detail: 'prefers terse responses without trailing summaries', kind: 'preference'}],
    });
    expect(c!.kind).toBe('user_preference');
    expect(c!.summary).toMatch(/^User preference:/);
  });

  it('converts failure signal', () => {
    const [c] = extractMemoryCandidateFromRun({
      signals: [{detail: 'vitest watch mode breaks coverage reports', kind: 'failure'}],
    });
    expect(c!.kind).toBe('pitfall');
    expect(c!.summary).toMatch(/^Pitfall:/);
  });

  it('skips empty signals', () => {
    const results = extractMemoryCandidateFromRun({
      signals: [{detail: '', kind: 'note'}, {detail: 'Valid note about the project structure', kind: 'note'}],
    });
    expect(results).toHaveLength(1);
  });

  it('includes goal tag when provided', () => {
    const [c] = extractMemoryCandidateFromRun({
      goal: 'fix tests',
      signals: [{detail: 'rerun npm run build after touching tsup config', kind: 'fix_applied'}],
    });
    expect(c!.tags).toContain('from-run');
    expect(c!.tags.some((t) => t.startsWith('goal:'))).toBe(true);
  });

  it('truncates very long observations', () => {
    const longDetail = 'x'.repeat(1000);
    const [c] = extractMemoryCandidateFromRun({
      signals: [{detail: longDetail, kind: 'note'}],
    });
    expect(c!.observation.length).toBeLessThanOrEqual(501);
  });
});
