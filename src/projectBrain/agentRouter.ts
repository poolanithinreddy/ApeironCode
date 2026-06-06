import {redactProjectBrainText} from './safety.js';
import type {ProjectBrainSummary} from './types.js';

export type AgentRoutingExecutionMode =
  | 'single-agent'
  | 'planned-subagents'
  | 'task-decomposition'
  | 'review-only'
  | 'no-agent';

export interface AgentRouteEntry {
  name: string;
  role: string;
  reason: string;
}

export interface AgentRoutingPlan {
  selectedAgents: AgentRouteEntry[];
  selectedSkills: string[];
  executionMode: AgentRoutingExecutionMode;
  reason: string;
  estimatedTokenCost: 'low' | 'medium' | 'high';
  expectedBenefit: string;
}

export interface AgentRegistrySummary {
  agents: Array<{name: string; description: string}>;
  skills: Array<{name: string; description: string; whenToUse?: string}>;
}

export interface RoutePromptOptions {
  maxAgents?: number;
  maxSkills?: number;
  tokenBudget?: number;
}

// Keyword patterns for routing
const FRONTEND_RE = /\b(frontend|ui|ux|react|vue|svelte|css|tailwind|component|page|layout|design)\b/iu;
const BACKEND_RE = /\b(backend|api|server|database|db|postgres|prisma|endpoint|route|auth|jwt)\b/iu;
const TEST_RE = /\b(test|spec|failing|coverage|vitest|jest|playwright|e2e|tdd)\b/iu;
const REVIEW_RE = /\b(review|security|audit|vulnerability|refactor)\b/iu;
const ARCH_RE = /\b(architect|architecture|design|structure|adr|decision)\b/iu;
const DEPLOY_RE = /\b(deploy|ci|cd|docker|kubernetes|vercel|netlify|cloud)\b/iu;
const LARGE_BUILD_RE = /\b(build|create|develop|ship)\b.{80,}\b(app|saas|platform|product|dashboard)\b/isu;
const SIMPLE_EDIT_RE = /^.{0,120}$/u; // short prompts = simple

const isLargeBuild = (prompt: string): boolean => LARGE_BUILD_RE.test(prompt);
const isSimpleEdit = (prompt: string): boolean =>
  SIMPLE_EDIT_RE.test(prompt.trim()) &&
  !isLargeBuild(prompt) &&
  !/\b(build|implement|create|develop)\b/iu.test(prompt);

const tokenize = (text: string): string[] =>
  text.toLowerCase().split(/[\s,;|]+/u).filter((t) => t.length > 2);

const scoreAgent = (agent: {name: string; description: string}, promptTokens: string[]): number => {
  const agentTokens = new Set(tokenize(`${agent.name} ${agent.description}`));
  return promptTokens.filter((t) => agentTokens.has(t)).length;
};

const scoreSkill = (skill: {name: string; description: string; whenToUse?: string}, promptTokens: string[]): number => {
  const skillTokens = new Set(tokenize(`${skill.name} ${skill.description} ${skill.whenToUse ?? ''}`));
  return promptTokens.filter((t) => skillTokens.has(t)).length;
};

export const routePromptToProjectAgents = (
  prompt: string,
  _brainSummary: ProjectBrainSummary | null,
  registry: AgentRegistrySummary | null,
  options: RoutePromptOptions = {},
): AgentRoutingPlan => {
  const maxAgents = options.maxAgents ?? 3;
  const maxSkills = options.maxSkills ?? 3;

  if (isSimpleEdit(prompt)) {
    return {
      selectedAgents: [],
      selectedSkills: [],
      executionMode: 'no-agent',
      reason: 'Simple edit prompt — no subagents needed.',
      estimatedTokenCost: 'low',
      expectedBenefit: 'Direct execution is faster for small tasks.',
    };
  }

  const selectedAgents: AgentRouteEntry[] = [];
  const promptTokens = tokenize(prompt);

  // Rule-based routing (fast, no provider calls)
  if (isLargeBuild(prompt)) {
    selectedAgents.push({name: 'architect', role: 'planner', reason: 'Large app build detected — architect creates the roadmap.'});
    if (FRONTEND_RE.test(prompt)) selectedAgents.push({name: 'frontend-engineer', role: 'frontend', reason: 'Frontend requirements detected.'});
    if (BACKEND_RE.test(prompt)) selectedAgents.push({name: 'backend-engineer', role: 'backend', reason: 'Backend requirements detected.'});
  } else {
    if (FRONTEND_RE.test(prompt)) selectedAgents.push({name: 'frontend-engineer', role: 'frontend', reason: 'Frontend prompt detected.'});
    if (BACKEND_RE.test(prompt)) selectedAgents.push({name: 'backend-engineer', role: 'backend', reason: 'Backend prompt detected.'});
    if (TEST_RE.test(prompt)) selectedAgents.push({name: 'test-engineer', role: 'testing', reason: 'Test/fix prompt detected.'});
    if (ARCH_RE.test(prompt)) selectedAgents.push({name: 'architect', role: 'architecture', reason: 'Architecture prompt detected.'});
    if (REVIEW_RE.test(prompt)) selectedAgents.push({name: 'reviewer', role: 'review', reason: 'Review/security prompt detected.'});
    if (DEPLOY_RE.test(prompt)) selectedAgents.push({name: 'devops-engineer', role: 'deployment', reason: 'Deployment prompt detected.'});
  }

  // Score-based refinement from registry if available
  let finalAgents = selectedAgents;
  if (registry?.agents && registry.agents.length > 0) {
    const scored = registry.agents
      .map((a) => ({...a, score: scoreAgent(a, promptTokens)}))
      .filter((a) => a.score > 0)
      .sort((x, y) => y.score - x.score)
      .slice(0, maxAgents);
    if (scored.length > 0) {
      finalAgents = scored.map((a) => ({name: a.name, role: a.name, reason: `Matched ${a.score} prompt keywords.`}));
    }
  }

  // Skill selection
  const selectedSkills: string[] = [];
  if (registry?.skills) {
    const scoredSkills = registry.skills
      .map((s) => ({...s, score: scoreSkill(s, promptTokens)}))
      .filter((s) => s.score > 0)
      .sort((x, y) => y.score - x.score)
      .slice(0, maxSkills);
    selectedSkills.push(...scoredSkills.map((s) => s.name));
  }

  const agentsLimited = finalAgents.slice(0, maxAgents);
  const executionMode: AgentRoutingExecutionMode = isLargeBuild(prompt)
    ? 'planned-subagents'
    : agentsLimited.length > 1
      ? 'task-decomposition'
      : agentsLimited.length === 1
        ? 'single-agent'
        : 'no-agent';

  const tokenCost: 'low' | 'medium' | 'high' =
    agentsLimited.length > 2 ? 'high' : agentsLimited.length > 0 ? 'medium' : 'low';

  return {
    selectedAgents: agentsLimited,
    selectedSkills,
    executionMode,
    reason: agentsLimited.length > 0
      ? `Routing to ${agentsLimited.map((a) => a.name).join(', ')}.`
      : 'No specialized agents needed.',
    estimatedTokenCost: tokenCost,
    expectedBenefit: agentsLimited.length > 0
      ? 'Specialized agents improve output quality for this prompt type.'
      : 'Direct agent execution sufficient.',
  };
};

export const selectProjectSkillsForPrompt = (
  prompt: string,
  skills: Array<{name: string; description: string; whenToUse?: string}>,
  options: RoutePromptOptions = {},
): string[] => {
  const maxSkills = options.maxSkills ?? 3;
  const promptTokens = tokenize(prompt);
  return skills
    .map((s) => ({name: s.name, score: scoreSkill(s, promptTokens)}))
    .filter((s) => s.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, maxSkills)
    .map((s) => s.name);
};

export const createAgentRoutingPlan = (
  prompt: string,
  options: RoutePromptOptions = {},
): AgentRoutingPlan =>
  routePromptToProjectAgents(prompt, null, null, options);

export const formatAgentRoutingPlan = (plan: AgentRoutingPlan): string =>
  redactProjectBrainText([
    `Agent Routing Plan`,
    `Mode: ${plan.executionMode}`,
    `Token cost: ${plan.estimatedTokenCost}`,
    `Reason: ${plan.reason}`,
    plan.selectedAgents.length > 0
      ? `Agents:\n${plan.selectedAgents.map((a) => `  ${a.name} (${a.role}): ${a.reason}`).join('\n')}`
      : 'Agents: none',
    plan.selectedSkills.length > 0
      ? `Skills: ${plan.selectedSkills.join(', ')}`
      : 'Skills: none',
    `Expected benefit: ${plan.expectedBenefit}`,
  ].join('\n'));
