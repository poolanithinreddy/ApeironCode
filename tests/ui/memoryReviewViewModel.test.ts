import {describe, expect, it} from 'vitest';

import type {MemorySuggestion} from '../../src/memory/suggestions.js';
import {buildMemoryReviewViewModel, formatMemoryReviewText} from '../../src/ui/memoryReviewViewModel.js';

describe('memory review view model', () => {
  it('renders empty and pending states', () => {
    expect(buildMemoryReviewViewModel([]).empty).toBe(true);
    const model = buildMemoryReviewViewModel([{
      confidence: 'high',
      createdAt: '2026-05-01T00:00:00.000Z',
      entityType: 'task',
      id: 'memsug_1',
      proposedFacts: [{name: 'fact', observation: 'obs', type: 'task'}],
      redactionApplied: true,
      relatedFiles: ['src/a.ts'],
      source: 'agent-run',
      status: 'pending',
      summary: 'Remember test command',
    }]);
    expect(model.empty).toBe(false);
    expect(model.items[0]?.hintLine).toContain('/memory approve memsug_1');
    expect(model.items[0]?.redactionLine).toContain('applied');
    expect(model.items[0]?.sourceLine).toContain('agent-run');
    expect(model.items[0]?.warningLine).toContain('redaction');
    expect(buildMemoryReviewViewModel([{...modelSuggestion(), status: 'approved'}], {status: 'approved'}).empty).toBe(false);
    expect(buildMemoryReviewViewModel([modelSuggestion()], {source: 'team'}).empty).toBe(true);
    expect(formatMemoryReviewText([modelSuggestion()], {confidence: 'high'})).toContain('Memory Review');
    expect(formatMemoryReviewText([modelSuggestion()])).toContain('/memory suggestion show memsug_1');
  });
});

const modelSuggestion = (): MemorySuggestion => ({
  confidence: 'high' as const,
  createdAt: '2026-05-01T00:00:00.000Z',
  entityType: 'task',
  id: 'memsug_1',
  proposedFacts: [{name: 'fact', observation: 'obs', type: 'task'}],
  redactionApplied: true,
  relatedFiles: ['src/a.ts'],
  source: 'agent-run' as const,
  status: 'pending' as const,
  summary: 'Remember test command',
});
