import path from 'node:path';

import {scanProject, type ProjectScan} from './scanner.js';
import {buildProjectIndex, type ProjectIndexEntry} from './indexer.js';
import {RepoMapManager, type RepoMapStatus} from './repoMap.js';
import {FileCache} from './fileCache.js';

const INTERNAL_IMPORT_EXTENSIONS = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '/index.ts',
  '/index.tsx',
  '/index.js',
  '/index.jsx',
  '/index.mjs',
  '/index.cjs',
];

export interface RepoDependencyHint {
  count: number;
  name: string;
}

export interface RepoHubFile {
  dependents: number;
  exports: number;
  imports: number;
  language: string;
  path: string;
  symbols: number;
}

export interface RepoIntelligenceReport {
  externalDependencies: RepoDependencyHint[];
  importantFiles: string[];
  internalHubs: RepoHubFile[];
  projectScan: ProjectScan;
  repoMapStatus: RepoMapStatus;
}

export interface RepoSymbolLineMatch {
  excerpt: string;
  line: number;
  why: string;
}

export interface RepoSymbolMatch {
  dependents: number;
  language: string;
  matches: RepoSymbolLineMatch[];
  path: string;
  score: number;
}

const resolveInternalImport = (
  fromPath: string,
  specifier: string,
  knownPaths: Set<string>,
): string | null => {
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
    return null;
  }

  const basePath = specifier.startsWith('/')
    ? specifier.replace(/^\/+/, '')
    : path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), specifier));

  for (const suffix of INTERNAL_IMPORT_EXTENSIONS) {
    const candidate = path.posix.normalize(`${basePath}${suffix}`);
    if (knownPaths.has(candidate)) {
      return candidate;
    }
  }

  return null;
};

const getPackageName = (specifier: string): string => {
  if (specifier.startsWith('@')) {
    const [scope, pkg] = specifier.split('/');
    return pkg ? `${scope}/${pkg}` : specifier;
  }

  return specifier.split('/')[0] ?? specifier;
};

const buildDependencyStats = (entries: ProjectIndexEntry[]) => {
  const knownPaths = new Set(entries.map((entry) => entry.path));
  const reverseDependencies = new Map<string, number>();
  const externalDependencies = new Map<string, number>();

  for (const entry of entries) {
    const seenInternal = new Set<string>();
    const seenExternal = new Set<string>();

    for (const specifier of entry.imports) {
      const internalImport = resolveInternalImport(entry.path, specifier, knownPaths);
      if (internalImport) {
        if (!seenInternal.has(internalImport)) {
          reverseDependencies.set(internalImport, (reverseDependencies.get(internalImport) ?? 0) + 1);
          seenInternal.add(internalImport);
        }
        continue;
      }

      const packageName = getPackageName(specifier);
      if (!packageName || seenExternal.has(packageName)) {
        continue;
      }

      externalDependencies.set(packageName, (externalDependencies.get(packageName) ?? 0) + 1);
      seenExternal.add(packageName);
    }
  }

  return {
    externalDependencies,
    reverseDependencies,
  };
};

const collectLineMatches = ({
  exportMatches,
  importMatches,
  pathMatch,
  query,
  symbolMatches,
  text,
}: {
  exportMatches: string[];
  importMatches: string[];
  pathMatch: boolean;
  query: string;
  symbolMatches: string[];
  text: string;
}): RepoSymbolLineMatch[] => {
  const lowerQuery = query.toLowerCase();
  const lines = text.split(/\r?\n/u);
  const hits: RepoSymbolLineMatch[] = [];
  const seen = new Set<number>();

  const matchWhy = (line: string): string | null => {
    const lowerLine = line.toLowerCase();
    const symbol = symbolMatches.find((value) => lowerLine.includes(value.toLowerCase()));
    if (symbol) {
      return `symbol:${symbol}`;
    }
    const exported = exportMatches.find((value) => lowerLine.includes(value.toLowerCase()));
    if (exported) {
      return `export:${exported}`;
    }
    const imported = importMatches.find((value) => lowerLine.includes(value.toLowerCase()));
    if (imported) {
      return `import:${imported}`;
    }
    if (lowerLine.includes(lowerQuery)) {
      return 'query text';
    }
    return pathMatch ? 'path match' : null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const why = matchWhy(line);
    if (!why || seen.has(index + 1)) {
      continue;
    }

    hits.push({
      excerpt: line.trim() || '(blank line)',
      line: index + 1,
      why,
    });
    seen.add(index + 1);

    if (hits.length >= 3) {
      break;
    }
  }

  return hits;
};

export const buildRepoIntelligenceReport = async ({
  cwd,
  ignorePatterns,
}: {
  cwd: string;
  ignorePatterns: string[];
}): Promise<RepoIntelligenceReport> => {
  const [projectScan, index] = await Promise.all([
    scanProject(cwd),
    buildProjectIndex(cwd, ignorePatterns),
  ]);
  const mapManager = new RepoMapManager(cwd);
  const {map, status} = await mapManager.ensureFreshMap(cwd);
  const dependencyStats = buildDependencyStats(index);

  const internalHubs = index
    .map((entry) => ({
      dependents: dependencyStats.reverseDependencies.get(entry.path) ?? 0,
      exports: entry.exports.length,
      imports: entry.imports.length,
      language: entry.language,
      path: entry.path,
      score: (dependencyStats.reverseDependencies.get(entry.path) ?? 0) * 4 + entry.exports.length * 2 + entry.imports.length + entry.symbols.length,
      symbols: entry.symbols.length,
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 6)
    .map((entry) => ({
      dependents: entry.dependents,
      exports: entry.exports,
      imports: entry.imports,
      language: entry.language,
      path: entry.path,
      symbols: entry.symbols,
    }));

  const externalDependencies = Array.from(dependencyStats.externalDependencies.entries())
    .map(([name, count]) => ({count, name}))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, 8);

  return {
    externalDependencies,
    importantFiles: mapManager.getImportantFiles(map),
    internalHubs,
    projectScan,
    repoMapStatus: {
      ageMs: status.ageMs,
      map,
      stale: status.stale,
      staleReasons: status.staleReasons,
    },
  };
};

export const formatRepoIntelligenceReport = (report: RepoIntelligenceReport): string => {
  const age = report.repoMapStatus.ageMs === null
    ? 'unknown'
    : `${Math.max(0, Math.round(report.repoMapStatus.ageMs / 60000))}m`;

  return [
    '## Repo Intelligence',
    '',
    report.projectScan.projectSummary,
    '',
    `Repo map: ${report.repoMapStatus.stale ? 'stale' : 'fresh'} (${age})`,
    `Branch: ${report.projectScan.git.branch ?? 'not a git repo'} | Changed files: ${report.projectScan.git.changedFiles}`,
    `Commands: test=${report.projectScan.testCommand ?? 'n/a'} | lint=${report.projectScan.lintCommand ?? 'n/a'} | build=${report.projectScan.buildCommand ?? 'n/a'}`,
    `Important files: ${report.importantFiles.join(', ') || 'none identified'}`,
    '',
    'Architecture hubs:',
    ...(report.internalHubs.length > 0
      ? report.internalHubs.map((entry) => `- ${entry.path} | dependents=${entry.dependents} | imports=${entry.imports} | exports=${entry.exports} | symbols=${entry.symbols}`)
      : ['- none identified']),
    '',
    'Dependency hints:',
    ...(report.externalDependencies.length > 0
      ? report.externalDependencies.map((entry) => `- ${entry.name} (${entry.count} file${entry.count === 1 ? '' : 's'})`)
      : ['- none identified']),
    '',
    'Changed paths:',
    ...(report.projectScan.git.changedPaths.length > 0
      ? report.projectScan.git.changedPaths.slice(0, 8).map((entry) => `- ${entry}`)
      : ['- clean working tree']),
  ].join('\n');
};

export const searchProjectSymbolsDetailed = async ({
  cwd,
  ignorePatterns,
  limit = 20,
  query,
}: {
  cwd: string;
  ignorePatterns: string[];
  limit?: number;
  query: string;
}): Promise<RepoSymbolMatch[]> => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const index = await buildProjectIndex(cwd, ignorePatterns);
  const dependencyStats = buildDependencyStats(index);
  const cache = new FileCache(cwd);

  const results = await Promise.all(index.map(async (entry) => {
    const symbolMatches = entry.symbols.filter((symbol) => symbol.toLowerCase().includes(normalizedQuery));
    const exportMatches = entry.exports.filter((symbol) => symbol.toLowerCase().includes(normalizedQuery));
    const importMatches = entry.imports.filter((specifier) => specifier.toLowerCase().includes(normalizedQuery));
    const pathMatch = entry.path.toLowerCase().includes(normalizedQuery);
    const score = symbolMatches.length * 4
      + exportMatches.length * 3
      + importMatches.length * 2
      + (dependencyStats.reverseDependencies.get(entry.path) ?? 0)
      + (pathMatch ? 1 : 0);

    if (score === 0) {
      return null;
    }

    const text = await cache.readText(entry.path).catch(() => entry.preview);
    return {
      dependents: dependencyStats.reverseDependencies.get(entry.path) ?? 0,
      language: entry.language,
      matches: collectLineMatches({
        exportMatches,
        importMatches,
        pathMatch,
        query,
        symbolMatches,
        text,
      }),
      path: entry.path,
      score,
    } satisfies RepoSymbolMatch;
  }));

  return results
    .filter((value): value is RepoSymbolMatch => value !== null)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, limit);
};

export const formatDetailedSymbolMatches = (matches: RepoSymbolMatch[], query: string): string => {
  if (matches.length === 0) {
    return `No symbol matches found for "${query}".`;
  }

  return matches
    .map((match) => [
      `${match.path} | ${match.language} | dependents=${match.dependents} | score=${match.score}`,
      ...(match.matches.length > 0
        ? match.matches.map((line) => `  L${line.line} | ${line.why} | ${line.excerpt}`)
        : ['  No matching lines captured.']),
    ].join('\n'))
    .join('\n\n');
};