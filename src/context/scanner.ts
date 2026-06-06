import fs from 'node:fs/promises';
import path from 'node:path';

import {execa} from 'execa';

import {buildProjectSummary} from './projectSummary.js';
import {readProjectManifests, type ManifestInfo} from './manifests.js';

export interface GitStatusSummary {
  branch: string | null;
  changedFiles: number;
  changedPaths: string[];
  isRepo: boolean;
}

export interface ProjectScan {
  buildCommand: string | null;
  configFiles: string[];
  entrypoints: string[];
  frameworks: string[];
  git: GitStatusSummary;
  languages: string[];
  lintCommand: string | null;
  manifests: ManifestInfo[];
  monorepo: boolean;
  packageManager: string | null;
  projectName: string;
  projectSummary: string;
  sourceDirectories: string[];
  testCommand: string | null;
  workspaces: string[];
}

const detectPackageManager = async (cwd: string): Promise<string | null> => {
  const candidates: Array<[string, string]> = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
    ['bun.lock', 'bun'],
    ['package-lock.json', 'npm'],
  ];

  for (const [fileName, manager] of candidates) {
    try {
      const stat = await fs.stat(path.join(cwd, fileName));
      if (stat.isFile()) {
        return manager;
      }
    } catch {
      continue;
    }
  }

  return null;
};

const detectSourceDirectories = async (cwd: string): Promise<string[]> => {
  const candidates = ['src', 'app', 'packages', 'services', 'lib', 'libs', 'server', 'client'];
  const found: string[] = [];

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(path.join(cwd, candidate));
      if (stat.isDirectory()) {
        found.push(candidate);
      }
    } catch {
      continue;
    }
  }

  return found;
};

const detectGitStatus = async (cwd: string): Promise<GitStatusSummary> => {
  const insideRepo = await execa('git', ['rev-parse', '--is-inside-work-tree'], {cwd, reject: false});

  if (insideRepo.exitCode !== 0 || insideRepo.stdout.trim() !== 'true') {
    return {
      branch: null,
      changedFiles: 0,
      changedPaths: [],
      isRepo: false,
    };
  }

  const [branchResult, statusResult] = await Promise.all([
    execa('git', ['branch', '--show-current'], {cwd, reject: false}),
    execa('git', ['status', '--short'], {cwd, reject: false}),
  ]);
  const changedPaths = statusResult.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .filter(Boolean);

  return {
    branch: branchResult.stdout.trim() || null,
    changedFiles: changedPaths.length,
    changedPaths,
    isRepo: true,
  };
};

export const scanProject = async (cwd: string): Promise<ProjectScan> => {
  const [manifests, packageManager, sourceDirectories, git] = await Promise.all([
    readProjectManifests(cwd),
    detectPackageManager(cwd),
    detectSourceDirectories(cwd),
    detectGitStatus(cwd),
  ]);

  const frameworks = Array.from(new Set(manifests.flatMap((manifest) => manifest.frameworks)));
  const languages = Array.from(new Set(manifests.flatMap((manifest) => manifest.languages)));
  const workspaces = Array.from(new Set(manifests.flatMap((manifest) => manifest.workspaces)));
  const entrypoints = Array.from(new Set(manifests.flatMap((manifest) => manifest.entrypoints)));
  const configFiles = manifests.map((manifest) => manifest.path);

  const scriptCommands = manifests.reduce(
    (commands, manifest) => ({
      build: commands.build ?? manifest.commands.build ?? null,
      lint: commands.lint ?? manifest.commands.lint ?? null,
      test: commands.test ?? manifest.commands.test ?? null,
    }),
    {build: null as string | null, lint: null as string | null, test: null as string | null},
  );

  const packageManifest = manifests.find((manifest) => manifest.kind === 'package.json');
  const projectName = packageManifest?.summary.replace(/^Node package\s+/u, '') || path.basename(cwd);

  const scan: ProjectScan = {
    buildCommand: scriptCommands.build,
    configFiles,
    entrypoints,
    frameworks,
    git,
    languages,
    lintCommand: scriptCommands.lint,
    manifests,
    monorepo: workspaces.length > 0,
    packageManager,
    projectName,
    projectSummary: '',
    sourceDirectories,
    testCommand: scriptCommands.test,
    workspaces,
  };
  scan.projectSummary = buildProjectSummary(scan);
  return scan;
};