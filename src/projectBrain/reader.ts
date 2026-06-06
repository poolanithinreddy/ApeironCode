import fs from 'node:fs/promises';
import path from 'node:path';

import {getProjectTrustStatus} from '../safety/projectTrust.js';
import {fileExists, readJsonFile, readTextFile} from '../utils/fs.js';
import {
  DEFAULT_PROJECT_BRAIN_FILES,
  PROJECT_BRAIN_DIR,
  type ProjectBrainManifest,
  type ProjectBrainSummary,
} from './types.js';
import {createProjectRootFingerprint, getProjectName, redactProjectBrainText, truncateForPrompt} from './safety.js';

export interface ReadProjectBrainOptions {
  maxCharsPerFile?: number;
  requireTrustForWorkflows?: boolean;
}

export interface ReadProjectBrainResult {
  exists: boolean;
  trusted: boolean;
  manifest: ProjectBrainManifest | null;
  files: Array<{relativePath: string; content: string}>;
  summary: ProjectBrainSummary;
}

export const readProjectBrainManifest = async (cwd: string): Promise<ProjectBrainManifest | null> =>
  readJsonFile<ProjectBrainManifest | null>(path.join(cwd, PROJECT_BRAIN_DIR, 'manifest.json'), null);

export const listProjectBrainFiles = async (cwd: string): Promise<string[]> => {
  const files: string[] = [];
  for (const file of DEFAULT_PROJECT_BRAIN_FILES) {
    if (await fileExists(path.join(cwd, file.relativePath))) files.push(file.relativePath);
  }
  return files;
};

const countMarkdown = async (cwd: string, dir: string): Promise<number> => {
  try {
    return (await fs.readdir(path.join(cwd, dir))).filter((entry) => entry.endsWith('.md')).length;
  } catch {
    return 0;
  }
};

export const buildProjectBrainSummary = async (
  cwd: string,
  options: ReadProjectBrainOptions = {},
): Promise<ProjectBrainSummary> => {
  const manifest = await readProjectBrainManifest(cwd);
  const present = await listProjectBrainFiles(cwd);
  const expected = DEFAULT_PROJECT_BRAIN_FILES.map((file) => file.relativePath);
  const trust = getProjectTrustStatus(cwd).trust;
  const exists = await fileExists(path.join(cwd, PROJECT_BRAIN_DIR, 'PROJECT.md'));
  const missing = expected.filter((file) => !present.includes(file));
  return {
    status: !exists && present.length === 0 ? 'missing' : missing.length === 0 ? 'initialized' : 'partial',
    projectName: manifest?.projectName ?? getProjectName(cwd),
    projectRootFingerprint: manifest?.projectRootFingerprint ?? createProjectRootFingerprint(cwd),
    manifestVersion: manifest?.version,
    keyFilesPresent: present,
    keyFilesMissing: missing,
    workflowCounts: {
      agents: await countMarkdown(cwd, '.apeironcode/agents'),
      commands: await countMarkdown(cwd, '.apeironcode/commands'),
      skills: await countMarkdown(cwd, '.apeironcode/skills'),
    },
    safeLoadStatus: present.length === 0
      ? 'missing'
      : trust === 'trusted'
        ? 'trusted-workflows'
        : options.requireTrustForWorkflows === false
          ? 'safe-summary'
          : 'blocked-untrusted',
    notes: trust === 'trusted' ? [] : ['Project Brain workflow files are not auto-loaded until the project is trusted.'],
  };
};

export const readProjectBrain = async (
  cwd: string,
  options: ReadProjectBrainOptions = {},
): Promise<ReadProjectBrainResult> => {
  const summary = await buildProjectBrainSummary(cwd, options);
  const manifest = await readProjectBrainManifest(cwd);
  const files: ReadProjectBrainResult['files'] = [];
  const max = options.maxCharsPerFile ?? 4_000;
  for (const file of DEFAULT_PROJECT_BRAIN_FILES.filter((entry) => entry.kind !== 'manifest')) {
    const target = path.join(cwd, file.relativePath);
    if (!(await fileExists(target))) continue;
    const content = truncateForPrompt(await readTextFile(target), max);
    files.push({relativePath: file.relativePath, content});
  }
  return {
    exists: summary.status !== 'missing',
    files,
    manifest,
    summary,
    trusted: getProjectTrustStatus(cwd).trust === 'trusted',
  };
};

export const formatProjectBrainSummary = (summary: ProjectBrainSummary): string => redactProjectBrainText([
  'Project Brain',
  `Status: ${summary.status}`,
  `Project: ${summary.projectName}`,
  `Fingerprint: ${summary.projectRootFingerprint}`,
  `Safe load: ${summary.safeLoadStatus}`,
  `Key files: ${summary.keyFilesPresent.length} present, ${summary.keyFilesMissing.length} missing`,
  `Workflows: ${summary.workflowCounts.agents} agents, ${summary.workflowCounts.skills} skills, ${summary.workflowCounts.commands} commands`,
  ...summary.notes.map((note) => `Note: ${note}`),
].join('\n'));
