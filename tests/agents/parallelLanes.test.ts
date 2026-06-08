import {describe, expect, it} from 'vitest';

import {formatParallelReadonlyLanePlan, planParallelReadonlyLanes} from '../../src/agents/parallelLanes.js';
import type {TeamPlan} from '../../src/agents/types.js';

describe('parallel read-only lane planning', () => {
  it('schedules only independent non-editing lanes', () => {
    const plan: TeamPlan = {
      goal: 'review auth',
      mode: 'sequential',
      steps: [
        {agent: 'planner', dependsOn: [], id: 'plan', task: 'plan'},
        {agent: 'reviewer', dependsOn: [], id: 'review', task: 'review'},
        {agent: 'coder', dependsOn: ['plan'], id: 'code', task: 'code'},
        {agent: 'tester', dependsOn: ['code'], id: 'test', task: 'test'},
      ],
    };

    const lanes = planParallelReadonlyLanes(plan);
    expect(lanes.parallel.map((step) => step.agent)).toEqual(['planner', 'reviewer']);
    expect(lanes.sequential.map((step) => step.agent)).toEqual(['coder', 'tester']);
    expect(formatParallelReadonlyLanePlan(lanes)).toContain('Parallel-safe now');
  });
});
