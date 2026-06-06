import {redactProjectBrainText, truncateForPrompt} from './safety.js';

export interface AppBuildPhase {
  id: string;
  name: string;
  description: string;
  tasks: string[];
  verificationSteps: string[];
}

export interface AppBuildPlan {
  productGoal: string;
  assumedStack: string[];
  unknowns: string[];
  phases: AppBuildPhase[];
  suggestedAgents: string[];
  suggestedCommands: string[];
  suggestedBrainFiles: string[];
  riskList: string[];
  suggestsProjectBrain: boolean;
  assumptions: string[];
}

// Matches large app-building prompts (120+ chars between action and noun)
const LARGE_BUILD_RE =
  /\b(build|create|implement|ship|develop|make)\b[\s\S]{80,}\b(app|application|product|site|website|dashboard|platform|extension|api|service|saas|tool)\b/iu;

// Matches small edits that should NOT trigger app-build orchestration
const SMALL_EDIT_RE =
  /\b(fix|add|update|change|rename|delete|remove|refactor|lint|format)\b\s+\w+/iu;

export const detectLargeAppBuildIntent = (prompt: string): boolean => {
  const trimmed = prompt.trim();
  if (trimmed.length < 200) return false;
  if (SMALL_EDIT_RE.test(trimmed.slice(0, 80)) && !LARGE_BUILD_RE.test(trimmed)) return false;
  return LARGE_BUILD_RE.test(trimmed);
};

const detectStack = (prompt: string): string[] => {
  const lower = prompt.toLowerCase();
  const stacks: string[] = [];
  if (/\b(next\.?js|nextjs)\b/u.test(lower)) stacks.push('Next.js');
  else if (/\b(react)\b/u.test(lower)) stacks.push('React');
  else if (/\b(vue)\b/u.test(lower)) stacks.push('Vue');
  else if (/\b(svelte)\b/u.test(lower)) stacks.push('Svelte');
  if (/\b(typescript|ts)\b/u.test(lower)) stacks.push('TypeScript');
  if (/\b(tailwind)\b/u.test(lower)) stacks.push('Tailwind CSS');
  if (/\b(postgres|postgresql|pg)\b/u.test(lower)) stacks.push('PostgreSQL');
  if (/\b(prisma)\b/u.test(lower)) stacks.push('Prisma');
  if (/\b(supabase)\b/u.test(lower)) stacks.push('Supabase');
  if (/\b(node|nodejs)\b/u.test(lower)) stacks.push('Node.js');
  if (/\b(express)\b/u.test(lower)) stacks.push('Express');
  if (/\b(docker)\b/u.test(lower)) stacks.push('Docker');
  if (stacks.length === 0) stacks.push('TypeScript (assumed)');
  return stacks;
};

export const createAppBuildPlan = (
  prompt: string,
  workspaceSummary: string = '',
  options: Record<string, unknown> = {},
): AppBuildPlan => {
  void workspaceSummary;
  void options;
  const goalSummary = truncateForPrompt(prompt, 200);
  const stack = detectStack(prompt);
  const isLarge = prompt.length > 1_000;

  const phases: AppBuildPhase[] = [
    {
      id: 'phase-1-foundation',
      name: 'Foundation',
      description: 'Project setup, tooling, directory structure, CI skeleton.',
      tasks: [
        'Initialize project with chosen stack',
        'Set up TypeScript, lint, format configs',
        'Configure CI/CD pipeline (GitHub Actions or similar)',
        'Create initial README and Project Brain',
      ],
      verificationSteps: ['npm run typecheck', 'npm run lint', 'npm run build'],
    },
    {
      id: 'phase-2-core',
      name: 'Core Domain',
      description: 'Implement core data models, API routes, and business logic.',
      tasks: [
        'Define data models / schema',
        'Implement API endpoints or server actions',
        'Add core business logic with unit tests',
        'Set up database migrations if applicable',
      ],
      verificationSteps: ['npm test', 'npm run build'],
    },
    {
      id: 'phase-3-ui',
      name: 'UI / Frontend',
      description: 'Build primary user interfaces and connect to backend.',
      tasks: [
        'Build main page layouts',
        'Implement key user flows',
        'Connect UI to API / data layer',
        'Add loading and error states',
      ],
      verificationSteps: ['npm run build', 'Manual smoke test in browser'],
    },
    {
      id: 'phase-4-hardening',
      name: 'Hardening & Polish',
      description: 'Auth, security, performance, edge cases, docs.',
      tasks: [
        'Add authentication and authorization',
        'Harden input validation and error handling',
        'Add E2E or integration tests for critical paths',
        'Write user-facing documentation',
      ],
      verificationSteps: ['npm run test:e2e', 'npm run test:acceptance', 'Security review'],
    },
    {
      id: 'phase-5-ship',
      name: 'Ship',
      description: 'Deploy, monitor, and iterate.',
      tasks: [
        'Configure deployment target',
        'Deploy to staging and smoke test',
        'Deploy to production',
        'Set up monitoring and alerts',
      ],
      verificationSteps: ['Staging smoke test', 'Production smoke test'],
    },
  ];

  const unknowns: string[] = [];
  if (!stack.some((s) => s.includes('PostgreSQL') || s.includes('Supabase') || s.includes('Prisma'))) {
    unknowns.push('Database technology not specified — will need to decide (PostgreSQL, SQLite, etc.)');
  }
  if (!stack.some((s) => s.includes('Next') || s.includes('React') || s.includes('Vue'))) {
    unknowns.push('Frontend framework not specified');
  }
  if (isLarge) {
    unknowns.push('Large prompt — some details may require clarification during development');
  }

  return {
    productGoal: goalSummary,
    assumedStack: stack,
    unknowns,
    phases,
    suggestedAgents: ['code-agent', 'review-agent', 'test-fix-agent'],
    suggestedCommands: ['npm run typecheck', 'npm run lint', 'npm run build', 'npm test'],
    suggestedBrainFiles: [
      '.apeironcode/PROJECT.md',
      '.apeironcode/PLAN.md',
      '.apeironcode/TASKS.md',
      '.apeironcode/VERIFY.md',
    ],
    riskList: [
      'Scope creep — keep phases focused',
      'Missing auth/security hardening until too late',
      'Test coverage gaps on critical paths',
      'Deployment environment drift from local dev',
    ],
    suggestsProjectBrain: true,
    assumptions: stack
      .filter((s) => s.includes('assumed'))
      .concat(unknowns.length > 0 ? ['See unknowns above'] : []),
  };
};

export const formatAppBuildPlan = (plan: AppBuildPlan): string =>
  redactProjectBrainText([
    '# App Build Plan',
    '',
    `**Goal:** ${plan.productGoal}`,
    `**Stack:** ${plan.assumedStack.join(', ')}`,
    '',
    plan.unknowns.length > 0
      ? `**Unknowns/Questions:**\n${plan.unknowns.map((u) => `- ${u}`).join('\n')}\n`
      : '',
    '## Phases',
    '',
    ...plan.phases.flatMap((phase) => [
      `### ${phase.name}`,
      phase.description,
      '',
      'Tasks:',
      ...phase.tasks.map((t) => `- [ ] ${t}`),
      '',
      `Verification: ${phase.verificationSteps.join(', ')}`,
      '',
    ]),
    '## Risks',
    ...plan.riskList.map((r) => `- ${r}`),
    '',
    plan.suggestsProjectBrain
      ? '> **Recommendation:** Run `apeironcode brain plan` to create a Project Brain for this multi-phase build.'
      : '',
  ].filter((l) => l !== null).join('\n'));

export const createBrainPlanFromAppBuildPrompt = (
  prompt: string,
  options: Record<string, unknown> = {},
): {plan: AppBuildPlan; formatted: string; suggestsInit: boolean} => {
  void options;
  const plan = createAppBuildPlan(prompt);
  return {plan, formatted: formatAppBuildPlan(plan), suggestsInit: plan.suggestsProjectBrain};
};
