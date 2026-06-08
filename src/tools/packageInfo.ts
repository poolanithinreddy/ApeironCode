import path from 'node:path';

import {z} from 'zod';

import {fileExists, readJsonFile} from '../utils/fs.js';
import {defineTool} from './types.js';

const PackageInfoInputSchema = z.object({}).default({});

const detectPackageManager = async (cwd: string): Promise<string | null> => {
  const candidates: Array<[string, string]> = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
    ['bun.lock', 'bun'],
    ['package-lock.json', 'npm'],
  ];

  for (const [fileName, manager] of candidates) {
    if (await fileExists(path.join(cwd, fileName))) {
      return manager;
    }
  }

  return null;
};

const detectFrameworks = async (cwd: string): Promise<string[]> => {
  const packageJson = await readJsonFile<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(path.join(cwd, 'package.json'), {});
  const dependencyNames = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ]);
  const frameworks: string[] = [];

  if (dependencyNames.has('react')) frameworks.push('React');
  if (dependencyNames.has('next')) frameworks.push('Next.js');
  if (dependencyNames.has('vite')) frameworks.push('Vite');
  if (dependencyNames.has('express')) frameworks.push('Express');
  if (await fileExists(path.join(cwd, 'pyproject.toml'))) frameworks.push('Python');
  if (await fileExists(path.join(cwd, 'go.mod'))) frameworks.push('Go');
  if (await fileExists(path.join(cwd, 'Cargo.toml'))) frameworks.push('Rust');
  if (await fileExists(path.join(cwd, 'pom.xml'))) frameworks.push('Maven');
  if (await fileExists(path.join(cwd, 'build.gradle'))) frameworks.push('Gradle');
  if (await fileExists(path.join(cwd, 'Dockerfile'))) frameworks.push('Docker');

  return frameworks;
};

export const packageInfoTool = defineTool({
  description: 'Detect package manager, scripts, and frameworks.',
  inputSchema: PackageInfoInputSchema,
  name: 'package_info',
  requiresApproval: false,
  riskLevel: 'low',
  async run(_rawInput, context) {
    const packageJson = await readJsonFile<{
      name?: string;
      scripts?: Record<string, string>;
    }>(path.join(context.cwd, 'package.json'), {});
    const packageManager = await detectPackageManager(context.cwd);
    const frameworks = await detectFrameworks(context.cwd);
    const payload = {
      frameworks,
      packageManager,
      projectName: packageJson.name ?? path.basename(context.cwd),
      scripts: packageJson.scripts ?? {},
    };

    return {
      ok: true,
      output: JSON.stringify(payload, null, 2),
      summary: 'Project metadata detected',
      metadata: payload,
    };
  },
});