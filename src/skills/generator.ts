import type {SkillMetadata} from './types.js';
import {validateSkillName} from './validator.js';

const slugify = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 48) || 'custom-skill';

export const createSkillFromDescription = (description: string, explicitName?: string): {markdown: string; metadata: SkillMetadata} => {
  const name = validateSkillName(explicitName ?? slugify(description));
  const metadata: SkillMetadata = {
    allowedTools: ['read_file', 'grep', 'glob', 'list_files'],
    description,
    examples: [`apeironcode skill run ${name} "apply this workflow to the current task"`],
    name,
    promptInstructions: [
      `You are running the "${name}" skill.`,
      'Follow the workflow below, inspect before editing, and ask for approval before using tools outside the skill scope.',
      description,
    ].join('\n'),
    requiredPermissions: [],
    safetyLevel: 'medium',
    tags: ['generated'],
    triggers: [description],
    version: '1.0.0',
  };

  const markdown = [
    `# ${name}`,
    '',
    description,
    '',
    '## Workflow',
    '',
    '1. Clarify the goal from the user input.',
    '2. Inspect the relevant project files.',
    '3. Make the smallest useful change or produce a focused report.',
    '4. Validate with the narrowest reliable command.',
    '5. Summarize what changed, what was validated, and any remaining risks.',
    '',
    '## Safety',
    '',
    'This generated skill starts with read-only tools. Add write or shell permissions only after review.',
  ].join('\n');

  return {markdown, metadata};
};

export const starterSkillNames = [
  'dependency-audit',
  'explain-repo',
  'fix-tests',
  'generate-readme',
  'github-pr-review',
  'lsp-debug',
  'refactor-safe',
  'release-checklist',
  'review-diff',
];

export const createStarterSkill = (name: string): {markdown: string; metadata: SkillMetadata} => {
  const descriptions: Record<string, string> = {
    'dependency-audit': 'Inspect dependency manifests, flag risky or stale dependencies, and recommend safe upgrade steps.',
    'explain-repo': 'Build a concise architecture explanation from manifests, README, source layout, and key entry points.',
    'fix-tests': 'Reproduce failing tests, localize the cause, patch the smallest behavior change, and rerun validation.',
    'generate-readme': 'Create or improve README content from real project behavior and commands.',
    'github-pr-review': 'Review a pull request diff locally and produce approval-gated GitHub review notes.',
    'lsp-debug': 'Use LSP status, diagnostics, symbols, and references to debug language-server-backed issues.',
    'refactor-safe': 'Plan a low-risk refactor, preserve behavior, and validate with tests or static checks.',
    'release-checklist': 'Run packaging, docs, security, and validation checks for a release candidate.',
    'review-diff': 'Review the current diff for bugs, regressions, missing tests, and security risks.',
  };
  return createSkillFromDescription(descriptions[name] ?? `Reusable workflow for ${name}.`, name);
};
