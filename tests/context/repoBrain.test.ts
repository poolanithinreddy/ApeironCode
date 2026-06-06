import {describe, expect, it} from 'vitest';

import {packContext} from '../../src/context/contextPacker.js';
import {inferDependencyGraph} from '../../src/context/dependencyGraph.js';
import {buildTokenBudgetReport} from '../../src/context/tokenBudget.js';

describe('repo brain', () => {
  it('packs context within a budget and infers local dependencies', () => {
    const summaries = [
      {hash: '1', path: 'src/a.ts', summary: "import {b} from './b'\nexport const a = b"},
      {hash: '2', path: 'src/b.ts', summary: 'export const b = 1'},
    ];
    expect(inferDependencyGraph(summaries)).toEqual([{from: 'src/a.ts', to: 'src/b.ts'}]);
    const packed = packContext(summaries, 20);
    expect(packed.selected.length).toBeGreaterThan(0);
    expect(buildTokenBudgetReport(packed.selected.map((summary) => summary.summary), 20).overBudget).toBe(false);
  });
});
