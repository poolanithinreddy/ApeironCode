import {redactProjectBrainText, truncateForPrompt} from './safety.js';
import {createAppBuildPlan, detectLargeAppBuildIntent, type AppBuildPlan} from './appBuildPlanner.js';
import {createAgentRoutingPlan, type AgentRoutingPlan} from './agentRouter.js';

export interface AppBuildOrchestration {
  productVision: string;
  assumptions: string[];
  questions: string[];
  stack: string[];
  architectureOutline: string[];
  phases: AppBuildPlan['phases'];
  taskBacklog: string[];
  suggestedAgents: AgentRoutingPlan['selectedAgents'];
  suggestedSkills: string[];
  verificationStrategy: string[];
  tokenStrategy: string;
  riskList: string[];
  firstThreeActions: string[];
  suggestsProjectBrain: boolean;
}

export interface OrchestrateOptions {
  maxQuestions?: number;
  tokenBudget?: number;
}

const MOBILE_RE = /\b(mobile|ios|android|react native|flutter|swift|kotlin)\b/iu;
const SAAS_RE = /\b(saas|subscription|billing|stripe|multi-tenant|tenant|workspace)\b/iu;
const REALTIME_RE = /\b(real-?time|socket|websocket|live|streaming|notification)\b/iu;
const ADMIN_RE = /\b(admin|panel|dashboard|cms|back-office|management)\b/iu;

const buildArchitectureOutline = (prompt: string, stack: string[]): string[] => {
  const outline: string[] = [];
  if (SAAS_RE.test(prompt)) {
    outline.push('Multi-tenant data isolation strategy');
    outline.push('Subscription management (Stripe or similar)');
  }
  if (REALTIME_RE.test(prompt)) {
    outline.push('WebSocket or SSE layer for real-time updates');
  }
  if (ADMIN_RE.test(prompt)) {
    outline.push('Admin panel with role-based access control');
  }
  if (stack.some((s) => s.includes('Next'))) {
    outline.push('Next.js App Router with server components');
    outline.push('API routes or Server Actions');
  }
  if (stack.some((s) => s.includes('PostgreSQL') || s.includes('Prisma') || s.includes('Supabase'))) {
    outline.push('PostgreSQL with migration strategy');
  }
  if (outline.length === 0) {
    outline.push('REST or GraphQL API layer');
    outline.push('Stateless authentication (JWT or sessions)');
  }
  return outline;
};

const buildTaskBacklog = (phases: AppBuildPlan['phases']): string[] =>
  phases.flatMap((p) => p.tasks.map((t) => `[${p.name}] ${t}`)).slice(0, 40);

const buildVerificationStrategy = (prompt: string): string[] => {
  const steps = [
    'npm run typecheck after each phase',
    'npm run lint to enforce code style',
    'Unit tests with ≥80% coverage on core business logic',
    'E2E tests for critical user flows',
  ];
  if (SAAS_RE.test(prompt)) steps.push('Billing integration tests with test mode keys');
  if (REALTIME_RE.test(prompt)) steps.push('WebSocket connection tests under load');
  if (MOBILE_RE.test(prompt)) steps.push('Device simulator tests for iOS and Android');
  steps.push('Security audit before first production deployment');
  return steps;
};

const buildFirstThreeActions = (plan: AppBuildPlan): string[] => {
  const firstPhase = plan.phases[0];
  return (firstPhase?.tasks ?? []).slice(0, 3);
};

const buildQuestions = (prompt: string): string[] => {
  const questions: string[] = [];
  if (!SAAS_RE.test(prompt) && !MOBILE_RE.test(prompt) && prompt.length < 300) {
    questions.push('Is this a SaaS product with subscriptions, or a single-user tool?');
  }
  if (!/\b(team|single|solo|user)\b/iu.test(prompt)) {
    questions.push('Is this for a single user or multiple users/teams?');
  }
  // Max 3 questions
  return questions.slice(0, 3);
};

export const decomposeAppBuildIntoPhases = (
  prompt: string,
  options: OrchestrateOptions = {},
): AppBuildPlan['phases'] => {
  void options;
  return createAppBuildPlan(prompt).phases;
};

export const createLargeAppBuildOrchestration = (
  prompt: string,
  workspaceSummary: string = '',
  options: OrchestrateOptions = {},
): AppBuildOrchestration => {
  void workspaceSummary;
  void options;

  const plan = createAppBuildPlan(prompt);
  const routingPlan = createAgentRoutingPlan(prompt, {maxAgents: 3, maxSkills: 3});

  const assumptions = [
    ...plan.assumedStack.filter((s) => s.includes('assumed')),
    'TypeScript will be used throughout',
    plan.phases.length > 3 ? 'Multi-phase build requires Project Brain for continuity' : '',
  ].filter(Boolean);

  const tokenStrategy = [
    'Load only relevant Project Brain files per prompt (progressive disclosure).',
    'Use compact PLAN.md + TASKS.md for continuation prompts.',
    'Full architecture context only when DECISIONS.md is needed.',
    `Estimated context tokens per session: ~${Math.min(900, 200 * plan.phases.length)}.`,
  ].join(' ');

  return {
    productVision: truncateForPrompt(prompt, 200),
    assumptions,
    questions: buildQuestions(prompt),
    stack: plan.assumedStack,
    architectureOutline: buildArchitectureOutline(prompt, plan.assumedStack),
    phases: plan.phases,
    taskBacklog: buildTaskBacklog(plan.phases),
    suggestedAgents: routingPlan.selectedAgents,
    suggestedSkills: routingPlan.selectedSkills,
    verificationStrategy: buildVerificationStrategy(prompt),
    tokenStrategy,
    riskList: plan.riskList,
    firstThreeActions: buildFirstThreeActions(plan),
    suggestsProjectBrain: plan.suggestsProjectBrain,
  };
};

export const createInitialBrainFilesFromOrchestration = (
  orchestration: AppBuildOrchestration,
): Record<string, string> => {
  const project = redactProjectBrainText([
    `# Project Vision`,
    '',
    orchestration.productVision,
    '',
    `## Stack`,
    orchestration.stack.map((s) => `- ${s}`).join('\n'),
    '',
    `## Architecture`,
    orchestration.architectureOutline.map((a) => `- ${a}`).join('\n'),
  ].join('\n'));

  const plan = redactProjectBrainText([
    `# Project Plan`,
    '',
    ...orchestration.phases.map((p) => [
      `## Phase ${p.id}: ${p.name}`,
      p.description,
      '',
      'Tasks:',
      p.tasks.map((t) => `- [ ] ${t}`).join('\n'),
      `Verification: ${p.verificationSteps.join(', ')}`,
      '',
    ].join('\n')),
  ].join('\n'));

  const tasks = redactProjectBrainText([
    `# Task Backlog`,
    '',
    orchestration.taskBacklog.map((t) => `- [ ] ${t}`).join('\n'),
  ].join('\n'));

  const verify = redactProjectBrainText([
    `# Verification Strategy`,
    '',
    orchestration.verificationStrategy.map((v) => `- ${v}`).join('\n'),
  ].join('\n'));

  return {
    'PROJECT.md': project,
    'PLAN.md': plan,
    'TASKS.md': tasks,
    'VERIFY.md': verify,
  };
};

export const createTaskBacklogFromOrchestration = (
  orchestration: AppBuildOrchestration,
): string[] => orchestration.taskBacklog;

export const formatLargeAppOrchestration = (orch: AppBuildOrchestration): string =>
  redactProjectBrainText([
    '# App Build Orchestration',
    '',
    `**Vision:** ${orch.productVision}`,
    `**Stack:** ${orch.stack.join(', ')}`,
    '',
    orch.questions.length > 0 ? `**Questions before starting:**\n${orch.questions.map((q) => `- ${q}`).join('\n')}\n` : '',
    orch.assumptions.length > 0 ? `**Assumptions:** ${orch.assumptions.join('; ')}` : '',
    '',
    '## Architecture',
    orch.architectureOutline.map((a) => `- ${a}`).join('\n'),
    '',
    `## Phases (${orch.phases.length})`,
    ...orch.phases.map((p) => `### ${p.name}\n${p.description}\nTasks: ${p.tasks.length} | Verification: ${p.verificationSteps[0] ?? '-'}`),
    '',
    '## First 3 Actions',
    orch.firstThreeActions.map((a, i) => `${i + 1}. ${a}`).join('\n'),
    '',
    `## Agents: ${orch.suggestedAgents.map((a) => a.name).join(', ') || 'none'}`,
    `## Skills: ${orch.suggestedSkills.join(', ') || 'none'}`,
    '',
    '## Verification Strategy',
    orch.verificationStrategy.map((v) => `- ${v}`).join('\n'),
    '',
    '## Risks',
    orch.riskList.map((r) => `- ${r}`).join('\n'),
    '',
    `## Token Strategy`,
    orch.tokenStrategy,
    '',
    orch.suggestsProjectBrain
      ? '> Run `apeironcode brain plan` then `brain init --yes` to initialize Project Brain for this build.'
      : '',
  ].filter(Boolean).join('\n'));

export {detectLargeAppBuildIntent};
