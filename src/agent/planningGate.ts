import type {ProjectScan} from '../context/scanner.js';
import {isPureChatIntent, isReadOnlyPlanningIntent} from './intentClassifier.js';
import type {AgentMode} from './types.js';

export interface PlanStep {
  order: number;
  description: string;
  estimatedDifficulty: 'easy' | 'medium' | 'hard';
  requiredApprovals?: string[];
}

export interface ExecutionPlan {
  id: string;
  goal: string;
  mode: AgentMode;
  createdAt: string;

  // Context
  projectFrameworks: string[];
  likelyAffectedFiles: string[];
  testCommand?: string;
  buildCommand?: string;

  // Plan details
  rationale: string;
  steps: PlanStep[];
  risks: string[];
  rollbackStrategy: string;
  estimatedComplexity: 'minimal' | 'moderate' | 'complex';
  estimatedSteps: number;

  // Execution tracking
  status: 'draft' | 'approved' | 'executing' | 'completed' | 'failed' | 'reverted';
  approvedAt?: string;
  approvedBy?: string;
  executionStarted?: string;
  executionCompleted?: string;

  // Results
  actualFilesChanged?: string[];
  actualStepsExecuted?: number;
  summary?: string;
  errors?: string[];
}

export const isLargeTechTask = (prompt: string): boolean => {
  const lowerPrompt = prompt.toLowerCase();
  const indicators = [
    /add|implement|create/i,
    /refactor|restructure|reorganize/i,
    /migrate|upgrade|update/i,
    /integrate|wire|connect/i,
  ];

  return indicators.some(pattern => pattern.test(lowerPrompt));
};

export const shouldRequirePlan = (
  mode: AgentMode,
  prompt: string,
  config?: {requireBeforeEdit?: boolean; largeTaskThreshold?: number},
): boolean => {
  // Plain conversation and read-only explanation/planning never require a
  // plan-approval prompt — they produce no mutating actions.
  if (isPureChatIntent(prompt) || isReadOnlyPlanningIntent(prompt)) {
    return false;
  }

  const requires = config?.requireBeforeEdit ?? false;

  if (requires) return true;

  // Auto-plan for these modes
  if (['plan', 'feature', 'refactor', 'debug'].includes(mode)) {
    return true;
  }

  // Auto-plan for large prompts
  if (isLargeTechTask(prompt)) {
    return true;
  }

  return false;
};

export const buildDefaultPlan = (
  goal: string,
  mode: AgentMode,
  projectScan: ProjectScan,
  likelyFiles: string[],
): ExecutionPlan => {
  const steps: PlanStep[] = [];

  // Step 1: Understand
  steps.push({
    order: 1,
    description: 'Understand the goal, affected modules, and dependencies',
    estimatedDifficulty: 'easy',
  });

  // Step 2: Inspect
  if (likelyFiles.length > 0) {
    steps.push({
      order: 2,
      description: `Read key files: ${likelyFiles.slice(0, 3).join(', ')}`,
      estimatedDifficulty: 'easy',
    });
  }

  // Step 3: Plan edits
  steps.push({
    order: 3,
    description: 'Identify exact files and changes needed',
    estimatedDifficulty: 'medium',
  });

  // Step 4: Execute
  steps.push({
    order: 4,
    description: 'Apply changes incrementally',
    estimatedDifficulty: 'medium',
    requiredApprovals: ['file_edit', 'file_write'],
  });

  // Step 5: Validate
  if (projectScan.testCommand || projectScan.buildCommand) {
    steps.push({
      order: 5,
      description: `Validate with ${projectScan.testCommand ? 'tests' : 'build'}`,
      estimatedDifficulty: 'easy',
    });
  }

  const risks: string[] = [];
  if (likelyFiles.length > 5) {
    risks.push('Multiple files will be modified - increased complexity');
  }
  if (goal.toLowerCase().includes('database')) {
    risks.push('Database schema changes require careful migration');
  }
  if (goal.toLowerCase().includes('api')) {
    risks.push('API changes may require dependency updates');
  }

  return {
    id: `plan-${Date.now()}`,
    goal,
    mode,
    createdAt: new Date().toISOString(),
    projectFrameworks: projectScan.frameworks,
    likelyAffectedFiles: likelyFiles.slice(0, 10),
    testCommand: projectScan.testCommand ?? undefined,
    buildCommand: projectScan.buildCommand ?? undefined,
    rationale: `This ${mode} task will ${goal.toLowerCase()}`,
    steps,
    risks: risks.length > 0 ? risks : ['None identified'],
    rollbackStrategy: 'Revert edited files using edit history; rebuild; rerun tests',
    estimatedComplexity: steps.length <= 3 ? 'minimal' : steps.length <= 5 ? 'moderate' : 'complex',
    estimatedSteps: steps.length,
    status: 'draft' as const,
  };
};

export const formatPlanForDisplay = (plan: ExecutionPlan): string => {
  const lines = [
    `## Execution Plan: ${plan.goal}`,
    '',
    `**Mode:** ${plan.mode}`,
    `**Complexity:** ${plan.estimatedComplexity}`,
    `**Estimated Steps:** ${plan.estimatedSteps}`,
    '',
    '### Plan',
    ...plan.steps.map(step =>
      `${step.order}. **${step.description}** [${step.estimatedDifficulty}]`
    ),
    '',
    '### Context',
    `- Frameworks: ${plan.projectFrameworks.length > 0 ? plan.projectFrameworks.join(', ') : 'none'}`,
    `- Test command: ${plan.testCommand || 'none'}`,
    `- Build command: ${plan.buildCommand || 'none'}`,
    `- Likely affected files: ${plan.likelyAffectedFiles.length} files`,
    '',
    '### Risks & Mitigations',
    ...plan.risks.map(risk => `- ${risk}`),
    '',
    '### Rollback Strategy',
    plan.rollbackStrategy,
  ];

  return lines.join('\n');
};
