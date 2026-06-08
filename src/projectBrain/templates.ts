import {
  DEFAULT_PROJECT_BRAIN_FILES,
  PROJECT_BRAIN_VERSION,
  type ProjectBrainFileKind,
  type ProjectBrainManifest,
} from './types.js';

export interface ProjectBrainTemplateInput {
  projectName: string;
  projectRootFingerprint: string;
  now: string;
}

const header = (title: string): string => `# ${title}\n\n`;

export const renderProjectBrainTemplate = (
  kind: ProjectBrainFileKind,
  input: ProjectBrainTemplateInput,
): string => {
  switch (kind) {
    case 'project':
      return `${header('Project Brain')}- Project: ${input.projectName}\n- Goal: [describe the product or repo goal]\n- Stack: [languages, frameworks, services]\n- Constraints: [important limits]\n- User preferences: [stable preferences]\n- Non-goals: [what this project should not do]\n`;
    case 'plan':
      return `${header('Current Plan')}- Current objective: [what ApeironCode should continue next]\n- Next action: [one concrete next step]\n\n## Phases\n- [ ] [phase or milestone]\n\n## Blockers\n- None recorded yet.\n`;
    case 'tasks':
      return `${header('Tasks')}\n## Backlog\n- [ ] [task]\n\n## In Progress\n- None.\n\n## Done\n- None.\n\n## Verification Tasks\n- [ ] [test/build/lint command to run]\n`;
    case 'decisions':
      return `${header('Decisions')}\n## Architecture Decisions\n- ${input.now.slice(0, 10)}: [decision, tradeoff, reason]\n`;
    case 'references':
      return `${header('References')}\n## Docs, Links, Local Files\n- [reference] - [why it matters]\n`;
    case 'verify':
      return `${header('Verification')}\n## Commands\n- Test: [command]\n- Build: [command]\n- Lint: [command]\n\n## Last Validation\n- Not recorded yet.\n`;
    case 'runs':
      return `${header('Run Summaries')}\nNo runs recorded yet.\n`;
    case 'memory':
      return `${header('Stable Project Memory')}\n## Facts\n- [stable project fact]\n\n## Conventions\n- [coding or product convention]\n\n## Gotchas\n- [known pitfall]\n`;
    default:
      return '';
  }
};

export const renderManifest = (input: ProjectBrainTemplateInput): ProjectBrainManifest => ({
  version: PROJECT_BRAIN_VERSION,
  projectName: input.projectName,
  projectRootFingerprint: input.projectRootFingerprint,
  createdAt: input.now,
  updatedAt: input.now,
  files: DEFAULT_PROJECT_BRAIN_FILES.map((file) => ({
    kind: file.kind,
    path: file.relativePath,
    updatedAt: input.now,
  })),
  notes: [
    'Project Brain is optional and user-approved.',
    'Agents, skills, and commands are markdown definitions and still respect project trust.',
  ],
});

export const DEFAULT_AGENT_TEMPLATES: Record<string, string> = {
  'architect.md': `---\nname: architect\ndescription: Project-specific architecture reviewer for this workspace.\npermissionMode: strict\nmemory: project\n---\n\nReview plans and changes for architecture consistency. Read project files first and keep recommendations grounded in this workspace.\n`,
  'frontend-engineer.md': `---\nname: frontend-engineer\ndescription: Project-specific frontend implementation helper.\npermissionMode: strict\nmemory: project\n---\n\nImplement frontend changes using the project's existing framework, components, and design conventions.\n`,
  'backend-engineer.md': `---\nname: backend-engineer\ndescription: Project-specific backend implementation helper.\npermissionMode: strict\nmemory: project\n---\n\nImplement backend changes using existing APIs, data models, and validation patterns.\n`,
  'test-engineer.md': `---\nname: test-engineer\ndescription: Project-specific testing and validation helper.\npermissionMode: strict\nmemory: project\n---\n\nFind focused validation paths, add meaningful tests, and avoid weakening existing coverage.\n`,
  'reviewer.md': `---\nname: reviewer\ndescription: Project-specific code review helper.\npermissionMode: strict\nmemory: project\n---\n\nReview changed files for correctness, safety, regressions, and missing validation.\n`,
};

export const DEFAULT_COMMAND_TEMPLATES: Record<string, string> = {
  'build-app.md': `---\nname: build-app\ndescription: Continue building the current app from Project Brain plan and tasks.\naliases: [build]\nrequiresTrust: true\npermissionMode: inherit\n---\n\nUse .apeironcode/PLAN.md and .apeironcode/TASKS.md to continue the app build. Inspect files before editing and update verification notes when done.\n`,
  'continue-plan.md': `---\nname: continue-plan\ndescription: Continue the next Project Brain task.\naliases: [continue-brain]\nrequiresTrust: false\npermissionMode: inherit\n---\n\nRead the Project Brain summary, identify the next safe action, and proceed only with normal ApeironCode approvals.\n`,
  'review-progress.md': `---\nname: review-progress\ndescription: Review Project Brain progress and identify blockers.\nrequiresTrust: false\npermissionMode: plan\n---\n\nSummarize PLAN.md, TASKS.md, RUNS.md, and VERIFY.md. Do not edit files unless explicitly asked.\n`,
  'fix-tests.md': `---\nname: fix-tests\ndescription: Use Project Brain verification notes to fix failing tests.\nrequiresTrust: true\npermissionMode: inherit\n---\n\nUse VERIFY.md and RUNS.md to understand recent failures, then inspect code and run focused tests.\n`,
};

export const renderWorkflowTemplate = (relativePath: string): string | null => {
  const name = relativePath.split('/').pop() ?? '';
  if (relativePath.includes('/agents/')) return DEFAULT_AGENT_TEMPLATES[name] ?? null;
  if (relativePath.includes('/commands/')) return DEFAULT_COMMAND_TEMPLATES[name] ?? null;
  return null;
};
