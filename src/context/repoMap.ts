import fs from 'node:fs/promises';
import path from 'node:path';
import {fileExists, ensureDirectory, writeTextFile, readTextFile} from '../utils/fs.js';
import {scanProject, type ProjectScan} from './scanner.js';
import {buildProjectIndex} from './indexer.js';
import {loadProjectIgnorePatterns} from './ignore.js';
import {getRepoMapPath} from '../utils/paths.js';

export interface PackageBoundary {
  manifestPath: string;
  name: string;
  rootDir: string;
}

export interface FrameworkHint {
  confidence: number;
  framework: 'react' | 'next' | 'node' | 'python' | 'go' | 'java' | 'unknown';
  reason: string;
}

export const detectPackageBoundaries = (files: string[]): PackageBoundary[] => {
  const out: PackageBoundary[] = [];
  for (const file of files) {
    const norm = file.replace(/\\/gu, '/');
    const base = norm.split('/').pop() ?? '';
    if (base === 'package.json' || base === 'pyproject.toml' || base === 'go.mod' || base === 'pom.xml' || base === 'build.gradle' || base === 'build.gradle.kts') {
      const rootDir = norm.split('/').slice(0, -1).join('/');
      const name = rootDir || '.';
      out.push({manifestPath: norm, name, rootDir});
    }
  }
  return out.sort((a, b) => a.rootDir.localeCompare(b.rootDir));
};

export const detectFrameworkHints = (
  files: string[],
  packageJson?: Record<string, unknown>,
): FrameworkHint[] => {
  const hints: FrameworkHint[] = [];
  const fileSet = new Set(files.map((f) => f.replace(/\\/gu, '/')));
  const deps: Record<string, unknown> = packageJson
    ? {
      ...((packageJson.dependencies ?? {}) as Record<string, unknown>),
      ...((packageJson.devDependencies ?? {}) as Record<string, unknown>),
    }
    : {};
  if ('next' in deps || files.some((f) => f.includes('next.config'))) {
    hints.push({confidence: 0.95, framework: 'next', reason: 'next dependency or next.config detected'});
  }
  if ('react' in deps || files.some((f) => f.endsWith('.tsx') || f.endsWith('.jsx'))) {
    hints.push({confidence: 0.85, framework: 'react', reason: 'react dependency or .tsx/.jsx files'});
  }
  if (fileSet.has('package.json')) {
    hints.push({confidence: 0.6, framework: 'node', reason: 'top-level package.json'});
  }
  if (files.some((f) => f.endsWith('pyproject.toml') || f.endsWith('requirements.txt') || f.endsWith('setup.py'))) {
    hints.push({confidence: 0.85, framework: 'python', reason: 'Python manifest detected'});
  }
  if (files.some((f) => f.endsWith('go.mod') || f.endsWith('go.sum'))) {
    hints.push({confidence: 0.95, framework: 'go', reason: 'go.mod detected'});
  }
  if (files.some((f) => f.endsWith('pom.xml') || f.endsWith('build.gradle') || f.endsWith('build.gradle.kts'))) {
    hints.push({confidence: 0.9, framework: 'java', reason: 'Maven or Gradle build file'});
  }
  if (hints.length === 0) hints.push({confidence: 0.2, framework: 'unknown', reason: 'no clear framework markers'});
  return hints.sort((a, b) => b.confidence - a.confidence);
};

export const summarizeRepoMap = (map: RepoMap): string => {
  const langs = Object.entries(map.languages).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([lang, count]) => `${lang}(${count})`).join(', ');
  return [
    `Repository: ${map.fileCount ?? map.entries.length} files`,
    `Languages: ${langs || 'none'}`,
    `Frameworks: ${map.projectScan.frameworks.join(', ') || 'none'}`,
    `Package manager: ${map.projectScan.packageManager ?? 'unknown'}`,
    `Test files: ${map.testFiles.length}, configs: ${map.configFiles.length}, entry points: ${map.entryPoints.length}`,
  ].join('\n');
};

export const buildRepoMap = async (cwd: string, _files?: string[]): Promise<RepoMap> => {
  void _files;
  const manager = new RepoMapManager(cwd);
  return manager.generateMap(cwd);
};

export interface RepoMapEntry {
  path: string;
  kind: 'directory' | 'file';
  language?: string;
  size?: number;
  lastModified?: string;
  isImportant?: boolean;
}

export interface RepoMap {
  entries: RepoMapEntry[];
  projectScan: ProjectScan;
  languages: Record<string, number>;
  entryPoints: string[];
  testFiles: string[];
  configFiles: string[];
  configSignature?: string;
  fileCount?: number;
  lastIndexed: string;
  version: string;
}

export interface RepoMapStatus {
  ageMs: number | null;
  map: RepoMap | null;
  stale: boolean;
  staleReasons: string[];
}

const DEFAULT_STALE_AGE_MS = 30 * 60 * 1000;

const buildConfigSignature = async (projectDir: string, configFiles: string[]): Promise<string> => {
  const parts = await Promise.all(
    configFiles.map(async (filePath) => {
      try {
        const stats = await fs.stat(path.join(projectDir, filePath));
        return `${filePath}:${stats.mtimeMs}`;
      } catch {
        return `${filePath}:missing`;
      }
    }),
  );

  return parts.sort().join('|');
};

export class RepoMapManager {
  private mapPath: string;

  constructor(projectDir: string) {
    this.mapPath = getRepoMapPath(projectDir);
  }

  private async loadIndexIgnorePatterns(projectDir: string): Promise<string[]> {
    return loadProjectIgnorePatterns(projectDir);
  }

  async generateMap(projectDir: string, maxEntries = 200): Promise<RepoMap> {
    const projectScan = await scanProject(projectDir);
    const indexed = await buildProjectIndex(projectDir, await this.loadIndexIgnorePatterns(projectDir));

    const languages: Record<string, number> = {};
    const testFiles: string[] = [];
    const configFiles: string[] = [];
    const entryPoints: string[] = [];
    const entries: RepoMapEntry[] = [];

    const seen = new Set<string>();

    for (const file of indexed.slice(0, maxEntries)) {
      if (seen.has(file.path)) continue;
      seen.add(file.path);

      const lang = file.language || 'unknown';
      languages[lang] = (languages[lang] || 0) + 1;

      if (file.kind === 'test') testFiles.push(file.path);
      if (file.kind === 'config') configFiles.push(file.path);

      if (/^(src\/)?(index|main|app|server)\.(ts|js|tsx)$/.test(file.path)) {
        entryPoints.push(file.path);
      }

      entries.push({
        path: file.path,
        kind: 'file',
        language: file.language,
        size: file.size,
      });
    }

    return {
      configSignature: await buildConfigSignature(projectDir, configFiles),
      entries,
      projectScan,
      fileCount: indexed.length,
      languages,
      entryPoints,
      testFiles: testFiles.slice(0, 20),
      configFiles: configFiles.slice(0, 20),
      lastIndexed: new Date().toISOString(),
      version: '1.0',
    };
  }

  async loadMap(): Promise<RepoMap | null> {
    try {
      if (!(await fileExists(this.mapPath))) {
        return null;
      }
      const content = await readTextFile(this.mapPath);
      return JSON.parse(content) as RepoMap;
    } catch {
      return null;
    }
  }

  async saveMap(map: RepoMap): Promise<void> {
    await ensureDirectory(path.dirname(this.mapPath));
    await writeTextFile(this.mapPath, JSON.stringify(map, null, 2));
  }

  async refreshMap(projectDir: string): Promise<RepoMap> {
    const map = await this.generateMap(projectDir);
    await this.saveMap(map);
    return map;
  }

  async getMapStatus(projectDir: string): Promise<RepoMapStatus> {
    const map = await this.loadMap();
    if (!map) {
      return {
        ageMs: null,
        map: null,
        stale: true,
        staleReasons: ['Repository map is missing.'],
      };
    }

    const staleReasons: string[] = [];
    const ageMs = Date.now() - new Date(map.lastIndexed).getTime();
    if (Number.isFinite(ageMs) && ageMs > DEFAULT_STALE_AGE_MS) {
      staleReasons.push('Repository map is older than 30 minutes.');
    }

    const currentIndex = await buildProjectIndex(projectDir, await this.loadIndexIgnorePatterns(projectDir));
    const currentCount = currentIndex.length;
    const previousCount = map.fileCount ?? map.entries.length;
    const countDelta = Math.abs(currentCount - previousCount);
    if (previousCount > 0 && countDelta >= Math.max(10, Math.floor(previousCount * 0.2))) {
      staleReasons.push('Project file count changed significantly since the last map refresh.');
    }

    const currentSignature = await buildConfigSignature(projectDir, map.configFiles);
    if ((map.configSignature ?? '') !== currentSignature) {
      staleReasons.push('Package or config files changed since the last map refresh.');
    }

    return {
      ageMs,
      map,
      stale: staleReasons.length > 0,
      staleReasons,
    };
  }

  async ensureFreshMap(projectDir: string, options?: {force?: boolean}): Promise<{map: RepoMap; status: RepoMapStatus}> {
    const status = options?.force
      ? {
          ageMs: null,
          map: await this.loadMap(),
          stale: true,
          staleReasons: ['Forced refresh requested.'],
        }
      : await this.getMapStatus(projectDir);

    if (status.stale || !status.map) {
      const map = await this.refreshMap(projectDir);
      return {
        map,
        status: {
          ageMs: 0,
          map,
          stale: false,
          staleReasons: status.staleReasons,
        },
      };
    }

    return {
      map: status.map,
      status,
    };
  }

  async getMapSummary(projectDir: string): Promise<string> {
    const {map, status} = await this.ensureFreshMap(projectDir);
    const ageMinutes = status.ageMs === null ? 'unknown' : `${Math.max(0, Math.round(status.ageMs / 60000))}m`;
    const importantFiles = this.getImportantFiles(map);

    const lines = [
      '## Repository Map',
      '',
      `**Status:** ${status.stale ? 'stale' : 'fresh'}`,
      `**Age:** ${ageMinutes}`,
      `**Stale reasons:** ${status.staleReasons.length > 0 ? status.staleReasons.join('; ') : 'none'}`,
      '',
      `**Languages:** ${Object.entries(map.languages)
        .map(([lang, count]) => `${lang} (${count})`)
        .join(', ')}`,
      '',
      `**Entry Points:** ${map.entryPoints.join(', ') || 'None detected'}`,
      '',
      `**Test Files:** ${map.testFiles.length} found`,
      '',
      `**Config Files:** ${map.configFiles.length} found`,
      '',
      `**Framework:** ${map.projectScan.frameworks.join(', ') || 'None detected'}`,
      '',
      `**Package Manager:** ${map.projectScan.packageManager || 'Unknown'}`,
      '',
      `**Last Indexed:** ${map.lastIndexed}`,
      '',
      `**Important files:** ${importantFiles.length > 0 ? importantFiles.join(', ') : 'none identified'}`,
    ];

    return lines.join('\n');
  }

  getImportantFiles(map: RepoMap, limit = 10): string[] {
    const important = [
      ...map.entryPoints,
      ...map.configFiles,
      ...map.testFiles.slice(0, 3),
      ...map.entries.filter(e => /^(README|LICENSE|CONTRIBUTING)/.test(e.path)).map(e => e.path),
    ];

    return Array.from(new Set(important)).slice(0, limit);
  }
}
