import type {TeamPlan} from './types.js';

export const createTeamPlan = (goal: string): TeamPlan => ({
  goal,
  mode: 'sequential',
  steps: [
    {agent: 'planner', dependsOn: [], id: 'plan', task: `Plan: ${goal}`},
    {agent: 'coder', dependsOn: ['plan'], id: 'code', task: `Implement the planned change for: ${goal}`},
    {agent: 'tester', dependsOn: ['code'], id: 'test', task: `Validate the change for: ${goal}`},
    {agent: 'reviewer', dependsOn: ['test'], id: 'review', task: `Review the final diff for: ${goal}`},
  ],
});
