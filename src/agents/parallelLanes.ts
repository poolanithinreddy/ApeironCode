import {getSubagentPolicy} from './policies.js';
import {getAgent} from './registry.js';
import type {TeamPlan, TeamStep} from './types.js';

export interface ParallelReadonlyLanePlan {
  blocked: Array<{reason: string; step: TeamStep}>;
  parallel: TeamStep[];
  sequential: TeamStep[];
}

export const isParallelReadonlyStep = (step: TeamStep): boolean => {
  const agent = getAgent(step.agent);
  if (!agent) {
    return false;
  }
  const policy = getSubagentPolicy(agent);
  return policy.parallelSafe && !policy.canEdit && !policy.canRunCommands;
};

export const planParallelReadonlyLanes = (plan: TeamPlan): ParallelReadonlyLanePlan => {
  const parallel: TeamStep[] = [];
  const sequential: TeamStep[] = [];
  const blocked: Array<{reason: string; step: TeamStep}> = [];

  for (const step of plan.steps) {
    if (!isParallelReadonlyStep(step)) {
      sequential.push(step);
      blocked.push({reason: 'role can edit, run commands, or is not marked parallel-safe', step});
      continue;
    }
    if (step.dependsOn.length > 0) {
      sequential.push(step);
      blocked.push({reason: `depends on ${step.dependsOn.join(', ')}`, step});
      continue;
    }
    parallel.push(step);
  }

  return {blocked, parallel, sequential};
};

export const formatParallelReadonlyLanePlan = (lanePlan: ParallelReadonlyLanePlan): string => [
  'Parallel read-only lane plan',
  `Parallel-safe now: ${lanePlan.parallel.length === 0 ? 'none' : lanePlan.parallel.map((step) => `${step.id}:${step.agent}`).join(', ')}`,
  `Sequential/editing lanes: ${lanePlan.sequential.length === 0 ? 'none' : lanePlan.sequential.map((step) => `${step.id}:${step.agent}`).join(', ')}`,
  lanePlan.blocked.length === 0
    ? 'Blocked lanes: none'
    : [
        'Blocked lanes:',
        ...lanePlan.blocked.map((entry) => `- ${entry.step.id}:${entry.step.agent} — ${entry.reason}`),
      ].join('\n'),
  '',
  'Note: Phase 15 schedules only non-editing, no-command lanes. Editing, testing, and merge/apply work remains sequential.',
].join('\n');
