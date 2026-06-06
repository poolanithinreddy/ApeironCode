import path from 'node:path';

import {fileExists, readJsonFile, readTextFile} from '../utils/fs.js';

export type ManifestKind =
  | 'Cargo.toml'
  | 'Dockerfile'
  | 'build.gradle'
  | 'docker-compose.yml'
  | 'go.mod'
  | 'next.config'
  | 'package.json'
  | 'pom.xml'
  | 'pyproject.toml'
  | 'requirements.txt'
  | 'tsconfig.json'
  | 'vite.config';

export interface ManifestInfo {
  commands: Partial<Record<'build' | 'lint' | 'test', string>>;
  entrypoints: string[];
  frameworks: string[];
  kind: ManifestKind;
  languages: string[];
  path: string;
  summary: string;
  workspaces: string[];
}

const readPackageManifest = async (cwd: string): Promise<ManifestInfo | null> => {
  const filePath = path.join(cwd, 'package.json');
  if (!(await fileExists(filePath))) {
    return null;
  }

  const pkg = await readJsonFile<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    main?: string;
    name?: string;
    scripts?: Record<string, string>;
    workspaces?: string[] | {packages?: string[]};
  }>(filePath, {});
  const dependencyNames = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]);
  const frameworks: string[] = [];
  if (dependencyNames.has('react')) frameworks.push('React');
  if (dependencyNames.has('next')) frameworks.push('Next.js');
  if (dependencyNames.has('vite')) frameworks.push('Vite');
  if (dependencyNames.has('express')) frameworks.push('Express');

  const workspaceValue = Array.isArray(pkg.workspaces)
    ? pkg.workspaces
    : Array.isArray(pkg.workspaces?.packages)
      ? pkg.workspaces.packages
      : [];

  return {
    commands: {
      build: pkg.scripts?.build,
      lint: pkg.scripts?.lint,
      test: pkg.scripts?.test,
    },
    entrypoints: pkg.main ? [pkg.main] : [],
    frameworks,
    kind: 'package.json',
    languages: ['TypeScript/Node.js'],
    path: 'package.json',
    summary: `Node package${pkg.name ? ` ${pkg.name}` : ''}${frameworks.length > 0 ? ` using ${frameworks.join(', ')}` : ''}`,
    workspaces: workspaceValue,
  };
};

const readTsConfigManifest = async (cwd: string): Promise<ManifestInfo | null> => {
  const filePath = path.join(cwd, 'tsconfig.json');
  if (!(await fileExists(filePath))) {
    return null;
  }

  const tsconfig = await readJsonFile<{compilerOptions?: {jsx?: string; module?: string; outDir?: string; rootDir?: string}}>(filePath, {});
  const summaryParts = [
    tsconfig.compilerOptions?.module ? `module ${tsconfig.compilerOptions.module}` : null,
    tsconfig.compilerOptions?.jsx ? `jsx ${tsconfig.compilerOptions.jsx}` : null,
    tsconfig.compilerOptions?.rootDir ? `root ${tsconfig.compilerOptions.rootDir}` : null,
    tsconfig.compilerOptions?.outDir ? `out ${tsconfig.compilerOptions.outDir}` : null,
  ].filter(Boolean);

  return {
    commands: {},
    entrypoints: [],
    frameworks: [],
    kind: 'tsconfig.json',
    languages: ['TypeScript'],
    path: 'tsconfig.json',
    summary: summaryParts.length > 0 ? summaryParts.join(', ') : 'TypeScript compiler configuration',
    workspaces: [],
  };
};

const detectSimpleManifest = async (
  cwd: string,
  relativePath: string,
  kind: ManifestKind,
  summary: string,
  languages: string[],
  frameworks: string[] = [],
): Promise<ManifestInfo | null> => {
  if (!(await fileExists(path.join(cwd, relativePath)))) {
    return null;
  }

  return {
    commands: {},
    entrypoints: [],
    frameworks,
    kind,
    languages,
    path: relativePath,
    summary,
    workspaces: [],
  };
};

const readRequirementsManifest = async (cwd: string): Promise<ManifestInfo | null> => {
  const filePath = path.join(cwd, 'requirements.txt');
  if (!(await fileExists(filePath))) {
    return null;
  }

  const raw = await readTextFile(filePath);
  const packages = raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  return {
    commands: {},
    entrypoints: [],
    frameworks: [],
    kind: 'requirements.txt',
    languages: ['Python'],
    path: 'requirements.txt',
    summary: packages.length > 0 ? `Python requirements: ${packages.slice(0, 4).join(', ')}` : 'Python requirements file',
    workspaces: [],
  };
};

const readPyProjectManifest = async (cwd: string): Promise<ManifestInfo | null> => {
  const filePath = path.join(cwd, 'pyproject.toml');
  if (!(await fileExists(filePath))) {
    return null;
  }

  const raw = await readTextFile(filePath);
  const usesPoetry = /\[tool\.poetry\]/u.test(raw);
  const usesPdm = /\[tool\.pdm\]/u.test(raw);
  const usesRuff = /\[tool\.ruff\]/u.test(raw);
  const frameworks = [usesPoetry ? 'Poetry' : null, usesPdm ? 'PDM' : null, usesRuff ? 'Ruff' : null].filter(
    (value): value is string => Boolean(value),
  );

  return {
    commands: {},
    entrypoints: [],
    frameworks,
    kind: 'pyproject.toml',
    languages: ['Python'],
    path: 'pyproject.toml',
    summary: frameworks.length > 0 ? `Python project using ${frameworks.join(', ')}` : 'Python project configuration',
    workspaces: [],
  };
};

const readGoManifest = async (cwd: string): Promise<ManifestInfo | null> => {
  const filePath = path.join(cwd, 'go.mod');
  if (!(await fileExists(filePath))) {
    return null;
  }

  const raw = await readTextFile(filePath);
  const moduleName = raw.match(/^module\s+(.+)$/mu)?.[1]?.trim();
  return {
    commands: {},
    entrypoints: [],
    frameworks: [],
    kind: 'go.mod',
    languages: ['Go'],
    path: 'go.mod',
    summary: moduleName ? `Go module ${moduleName}` : 'Go module configuration',
    workspaces: [],
  };
};

const readCargoManifest = async (cwd: string): Promise<ManifestInfo | null> => {
  const filePath = path.join(cwd, 'Cargo.toml');
  if (!(await fileExists(filePath))) {
    return null;
  }

  const raw = await readTextFile(filePath);
  const crateName = raw.match(/^name\s*=\s*"(.+)"$/mu)?.[1]?.trim();
  return {
    commands: {},
    entrypoints: [],
    frameworks: [],
    kind: 'Cargo.toml',
    languages: ['Rust'],
    path: 'Cargo.toml',
    summary: crateName ? `Rust crate ${crateName}` : 'Rust cargo manifest',
    workspaces: [],
  };
};

const readPomManifest = async (cwd: string): Promise<ManifestInfo | null> => {
  const filePath = path.join(cwd, 'pom.xml');
  if (!(await fileExists(filePath))) {
    return null;
  }

  const raw = await readTextFile(filePath);
  const artifactId = raw.match(/<artifactId>([^<]+)<\/artifactId>/u)?.[1]?.trim();
  return {
    commands: {},
    entrypoints: [],
    frameworks: ['Maven'],
    kind: 'pom.xml',
    languages: ['Java'],
    path: 'pom.xml',
    summary: artifactId ? `Maven project ${artifactId}` : 'Maven project configuration',
    workspaces: [],
  };
};

const readGradleManifest = async (cwd: string): Promise<ManifestInfo | null> => {
  const filePath = path.join(cwd, 'build.gradle');
  if (!(await fileExists(filePath))) {
    return null;
  }

  return {
    commands: {},
    entrypoints: [],
    frameworks: ['Gradle'],
    kind: 'build.gradle',
    languages: ['Java'],
    path: 'build.gradle',
    summary: 'Gradle build configuration',
    workspaces: [],
  };
};

export const readProjectManifests = async (cwd: string): Promise<ManifestInfo[]> => {
  const manifests = await Promise.all([
    readPackageManifest(cwd),
    readTsConfigManifest(cwd),
    detectSimpleManifest(cwd, 'vite.config.ts', 'vite.config', 'Vite configuration', ['TypeScript/Node.js'], ['Vite']),
    detectSimpleManifest(cwd, 'vite.config.js', 'vite.config', 'Vite configuration', ['JavaScript/Node.js'], ['Vite']),
    detectSimpleManifest(cwd, 'next.config.js', 'next.config', 'Next.js configuration', ['JavaScript/Node.js'], ['Next.js']),
    detectSimpleManifest(cwd, 'next.config.mjs', 'next.config', 'Next.js configuration', ['JavaScript/Node.js'], ['Next.js']),
    readPyProjectManifest(cwd),
    readRequirementsManifest(cwd),
    readGoManifest(cwd),
    readCargoManifest(cwd),
    readPomManifest(cwd),
    readGradleManifest(cwd),
    detectSimpleManifest(cwd, 'Dockerfile', 'Dockerfile', 'Docker build recipe', [], ['Docker']),
    detectSimpleManifest(cwd, 'docker-compose.yml', 'docker-compose.yml', 'Docker Compose stack', [], ['Docker']),
  ]);

  return manifests.filter((manifest): manifest is ManifestInfo => manifest !== null);
};