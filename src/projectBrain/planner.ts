import fs from 'node:fs/promises';
import path from 'node:path';

import {readJsonFile} from '../utils/fs.js';
import {
  DEFAULT_PROJECT_BRAIN_FILES,
  DEFAULT_PROJECT_BRAIN_FOLDERS,
  PROJECT_BRAIN_DIR,
  type ProjectBrainFile,
  type ProjectBrainFileStatus,
  type ProjectBrainInitPlan,
  type ProjectBrainManifest,
  type ProjectBrainStatus,
  type ProjectBrainSummary,
} from './types.js';
import {renderManifest, renderProjectBrainTemplate, renderWorkflowTemplate} from './templates.js';
import {createProjectRootFingerprint, getProjectName, redactProjectBrainText} from './safety.js';

export interface ProjectBrainPlanOptions {
  includeWorkflowTemplates?: boolean;
  now?: string;
}

const exists = async (target: string): Promise<boolean> => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

const statKind = async (target: string): Promise<'missing' | 'file' | 'directory'> => {
  try {
    const stat = await fs.stat(target);
    return stat.isDirectory() ? 'directory' : 'file';
  } catch {
    return 'missing';
  }
};

const workflowFiles = [
  ...['architect.md', 'frontend-engineer.md', 'backend-engineer.md', 'test-engineer.md', 'reviewer.md']
    .map((name) => `.apeironcode/agents/${name}`),
  ...['build-app.md', 'continue-plan.md', 'review-progress.md', 'fix-tests.md']
    .map((name) => `.apeironcode/commands/${name}`),
];

export const detectExistingProjectBrain = async (cwd: string): Promise<ProjectBrainStatus> => {
  const brainDir = path.join(cwd, PROJECT_BRAIN_DIR);
  const kind = await statKind(brainDir);
  if (kind === 'missing') return 'missing';
  if (kind === 'file') return 'conflict';
  const present = await Promise.all(DEFAULT_PROJECT_BRAIN_FILES.map((file) => exists(path.join(cwd, file.relativePath))));
  if (present.every(Boolean)) return 'initialized';
  if (present.some(Boolean)) return 'partial';
  return 'partial';
};

export const classifyProjectBrainFileStatus = async (
  cwd: string,
): Promise<Record<string, ProjectBrainFileStatus>> => {
  const statuses: Record<string, ProjectBrainFileStatus> = {};
  for (const file of DEFAULT_PROJECT_BRAIN_FILES) {
    const target = path.join(cwd, file.relativePath);
    const kind = await statKind(target);
    statuses[file.relativePath] = kind === 'missing' ? 'will-create' : kind === 'file' ? 'will-preserve' : 'conflict';
  }
  return statuses;
};

export const summarizeWorkspaceForBrain = async (
  cwd: string,
  options: ProjectBrainPlanOptions = {},
): Promise<ProjectBrainSummary> => {
  const status = await detectExistingProjectBrain(cwd);
  const manifest = await readJsonFile<ProjectBrainManifest | null>(
    path.join(cwd, PROJECT_BRAIN_DIR, 'manifest.json'),
    null,
  );
  const present: string[] = [];
  const missing: string[] = [];
  for (const file of DEFAULT_PROJECT_BRAIN_FILES) {
    if (await exists(path.join(cwd, file.relativePath))) present.push(file.relativePath);
    else missing.push(file.relativePath);
  }

  const countMd = async (dir: string): Promise<number> => {
    try {
      return (await fs.readdir(path.join(cwd, dir))).filter((entry) => entry.endsWith('.md')).length;
    } catch {
      return 0;
    }
  };

  return {
    status,
    projectName: manifest?.projectName ?? getProjectName(cwd),
    projectRootFingerprint: manifest?.projectRootFingerprint ?? createProjectRootFingerprint(cwd),
    manifestVersion: manifest?.version,
    keyFilesPresent: present,
    keyFilesMissing: missing,
    workflowCounts: {
      agents: await countMd('.apeironcode/agents'),
      commands: await countMd('.apeironcode/commands'),
      skills: await countMd('.apeironcode/skills'),
    },
    safeLoadStatus: status === 'missing' ? 'missing' : options.includeWorkflowTemplates ? 'safe-summary' : 'safe-summary',
    notes: status === 'conflict' ? ['.apeironcode exists as a file, not a directory.'] : [],
  };
};

export const createProjectBrainInitPlan = async (
  cwd: string,
  options: ProjectBrainPlanOptions = {},
): Promise<ProjectBrainInitPlan> => {
  const now = options.now ?? new Date().toISOString();
  const projectName = getProjectName(cwd);
  const projectRootFingerprint = createProjectRootFingerprint(cwd);
  const input = {now, projectName, projectRootFingerprint};
  const status = await detectExistingProjectBrain(cwd);
  const files: ProjectBrainFile[] = [];

  for (const file of DEFAULT_PROJECT_BRAIN_FILES) {
    const target = path.join(cwd, file.relativePath);
    const kind = await statKind(target);
    const content = file.kind === 'manifest'
      ? `${JSON.stringify(renderManifest(input), null, 2)}\n`
      : renderProjectBrainTemplate(file.kind, input);
    files.push({
      ...file,
      content: redactProjectBrainText(content),
      path: target,
      status: kind === 'missing' ? 'will-create' : kind === 'file' ? 'will-preserve' : 'conflict',
    });
  }

  if (options.includeWorkflowTemplates ?? true) {
    for (const relativePath of workflowFiles) {
      const content = renderWorkflowTemplate(relativePath);
      if (!content) continue;
      const target = path.join(cwd, relativePath);
      const kind = await statKind(target);
      files.push({
        content: redactProjectBrainText(content),
        kind: relativePath.includes('/agents/') ? 'agent' : 'command',
        path: target,
        relativePath,
        required: false,
        status: kind === 'missing' ? 'will-create' : kind === 'file' ? 'will-preserve' : 'conflict',
      });
    }
  }

  const warnings = files.some((file) => file.status === 'conflict')
    ? ['One or more Project Brain paths conflict with directories or non-file entries.']
    : [];
  return {
    brainDir: path.join(cwd, PROJECT_BRAIN_DIR),
    createdAt: now,
    cwd,
    files,
    folders: [...DEFAULT_PROJECT_BRAIN_FOLDERS],
    mode: status === 'missing' ? 'create' : status === 'conflict' ? 'repair' : 'merge',
    requiresApproval: true,
    status,
    summary: await summarizeWorkspaceForBrain(cwd, options),
    updatedAt: now,
    benefits: [
      'Keeps the project goal, plan, tasks, decisions, verification, and run summaries in one predictable place.',
      'Improves continuation prompts without requiring manual state recaps.',
      'Lets project-specific agents and commands live beside the repo while still respecting project trust.',
    ],
    warnings,
  };
};

export const formatProjectBrainInitPlan = (plan: ProjectBrainInitPlan): string => {
  const lines = [
    'Project Brain plan',
    `Status: ${plan.status}`,
    `Mode: ${plan.mode}`,
    `Requires approval: ${plan.requiresApproval ? 'yes' : 'no'}`,
    '',
    'Why it helps:',
    ...plan.benefits.map((benefit) => `- ${benefit}`),
    '',
    'Files:',
    ...plan.files.map((file) => `- ${file.relativePath} (${file.status})`),
  ];
  if (plan.warnings.length > 0) {
    lines.push('', 'Warnings:', ...plan.warnings.map((warning) => `- ${warning}`));
  }
  return redactProjectBrainText(lines.join('\n'));
};
