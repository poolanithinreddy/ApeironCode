import {describe, expect, it} from 'vitest';
import {
  dedupePromptSegments,
  enforcePromptBudget,
  formatPromptOptimizationReport,
  optimizePromptSegments,
  optimizePromptSegmentsV2,
  type PromptSegment,
} from '../../src/agent/promptOptimizer.js';

const segments: PromptSegment[] = [
  {content: 'safety rules', id: 'safety', priority: 100, required: true, type: 'safety'},
  {content: 'task', id: 'task', priority: 100, required: true, type: 'task'},
  {content: 'duplicate', id: 'a', priority: 10, type: 'memory'},
  {content: 'duplicate ', id: 'b', priority: 9, type: 'memory'},
  {content: 'low '.repeat(200), id: 'low', priority: 1, type: 'context'},
];

describe('prompt optimizer', () => {
  it('dedupes and never drops required safety/task segments', () => {
    expect(dedupePromptSegments(segments).map((segment) => segment.id)).not.toContain('b');
    const selected = enforcePromptBudget(segments, 5);
    expect(selected.map((segment) => segment.id)).toEqual(expect.arrayContaining(['safety', 'task']));
    const optimized = optimizePromptSegments(segments, {maxTokens: 8});
    expect(optimized.omittedSegments.length).toBeGreaterThan(0);
    expect(optimized.segments.map((segment) => segment.id)).toEqual(expect.arrayContaining(['safety', 'task']));
  });

  it('v2 trims optional segments first and reports savings', () => {
    const optimized = optimizePromptSegmentsV2(segments, {maxTokens: 8});
    expect(optimized.segments.map((segment) => segment.id)).toEqual(expect.arrayContaining(['safety', 'task']));
    expect(optimized.report.removedDuplicates).toBeGreaterThan(0);
    expect(formatPromptOptimizationReport(optimized.report)).toContain('saved=');
  });
});
