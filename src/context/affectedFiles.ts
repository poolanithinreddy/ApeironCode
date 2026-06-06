import type {ImportGraph} from './importGraph.js';
import type {SymbolGraph} from './symbolGraph.js';
import type {TestSourceMap} from './testMapper.js';
import {getTransitiveDependents} from './importGraph.js';

export interface AffectedFileResult {
  confidence: number;
  configFiles: string[];
  dependentFiles: string[];
  directFiles: string[];
  reasons: string[];
  testFiles: string[];
}

export interface AffectedAnalysisContext {
  configFiles?: string[];
  importGraph?: ImportGraph;
  lspDiagnostics?: Map<string, number>;
  packageBoundaries?: string[];
  symbolGraph?: SymbolGraph;
  testSourceMap?: TestSourceMap;
}

const isConfigPath = (file: string): boolean =>
  /(?:^|\/)(?:package\.json|tsconfig\.json|tsconfig\.[\w.-]+\.json|vitest\.config\.[tj]s|jest\.config\.[tj]s|eslint\.config\.[tj]s|\.eslintrc(?:\.[tj]s)?|prettier(?:\.config)?\.[tj]s)$/u.test(file);

const isPackageBoundaryFile = (file: string, boundaries: string[]): string | null => {
  for (const b of boundaries) {
    if (file === b || file.startsWith(`${b}/`)) return b;
  }
  return null;
};

export const findAffectedFiles = (
  changedFiles: string[],
  context: AffectedAnalysisContext = {},
): AffectedFileResult => {
  const reasons: string[] = [];
  const directFiles = Array.from(new Set(changedFiles));
  const dependents = new Set<string>();
  const tests = new Set<string>();
  const configs = new Set<string>();

  if (directFiles.length === 0) {
    return {
      confidence: 0,
      configFiles: [],
      dependentFiles: [],
      directFiles: [],
      reasons: ['No changed files provided.'],
      testFiles: [],
    };
  }

  reasons.push(`${directFiles.length} direct file(s) provided`);

  if (context.importGraph) {
    let importHits = 0;
    for (const file of directFiles) {
      const dependents2 = getTransitiveDependents(file, context.importGraph, 2);
      for (const dep of dependents2) {
        if (!directFiles.includes(dep)) {
          dependents.add(dep);
          importHits += 1;
        }
      }
    }
    if (importHits > 0) reasons.push(`import graph found ${importHits} dependent file(s)`);
  }

  if (context.symbolGraph) {
    let symHits = 0;
    for (const file of directFiles) {
      for (const ref of context.symbolGraph.references) {
        if (ref.toFile === file && ref.fromFile !== file && !directFiles.includes(ref.fromFile)) {
          dependents.add(ref.fromFile);
          symHits += 1;
        }
      }
    }
    if (symHits > 0) reasons.push(`symbol graph added ${symHits} reference(s)`);
  }

  if (context.testSourceMap) {
    let testHits = 0;
    for (const file of directFiles) {
      const associated = context.testSourceMap.testsForSource.get(file) ?? [];
      for (const test of associated) {
        tests.add(test);
        testHits += 1;
      }
    }
    if (testHits > 0) reasons.push(`test mapper added ${testHits} test file(s)`);
  }

  if (context.configFiles) {
    for (const f of context.configFiles) if (isConfigPath(f)) configs.add(f);
    if (configs.size > 0) reasons.push(`${configs.size} config file(s) included`);
  }

  if (context.packageBoundaries && context.packageBoundaries.length > 0) {
    const touched = new Set<string>();
    for (const file of directFiles) {
      const boundary = isPackageBoundaryFile(file, context.packageBoundaries);
      if (boundary) touched.add(boundary);
    }
    if (touched.size > 0) reasons.push(`spans ${touched.size} package boundary/boundaries: ${[...touched].sort().join(', ')}`);
  }

  if (context.lspDiagnostics) {
    let lspHits = 0;
    for (const [file, score] of context.lspDiagnostics) {
      if (score > 0 && !directFiles.includes(file)) {
        dependents.add(file);
        lspHits += 1;
      }
    }
    if (lspHits > 0) reasons.push(`${lspHits} additional file(s) flagged by LSP diagnostics`);
  }

  const totalSignals = (context.importGraph ? 1 : 0)
    + (context.symbolGraph ? 1 : 0)
    + (context.testSourceMap ? 1 : 0)
    + (context.lspDiagnostics ? 1 : 0)
    + (context.packageBoundaries ? 1 : 0);
  const confidence = Math.min(1, 0.4 + totalSignals * 0.12);

  return {
    confidence,
    configFiles: [...configs].sort(),
    dependentFiles: [...dependents].filter((f) => !directFiles.includes(f)).sort(),
    directFiles: directFiles.sort(),
    reasons,
    testFiles: [...tests].sort(),
  };
};

export const rankAffectedTests = (
  changedFiles: string[],
  context: AffectedAnalysisContext = {},
): string[] => {
  const score = new Map<string, number>();
  if (context.testSourceMap) {
    for (const file of changedFiles) {
      const associated = context.testSourceMap.testsForSource.get(file) ?? [];
      for (const test of associated) score.set(test, (score.get(test) ?? 0) + 1.0);
    }
  }
  if (context.importGraph) {
    for (const file of changedFiles) {
      const dependents = getTransitiveDependents(file, context.importGraph, 2);
      for (const dep of dependents) {
        if (/\.(?:test|spec)\.[tj]sx?$/u.test(dep)) {
          score.set(dep, (score.get(dep) ?? 0) + 0.5);
        }
      }
    }
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([f]) => f);
};

export const explainAffectedFiles = (result: AffectedFileResult): string => {
  const lines = [
    `Affected file analysis (confidence ${result.confidence.toFixed(2)}):`,
    `- direct: ${result.directFiles.length} (${result.directFiles.slice(0, 5).join(', ') || 'none'})`,
    `- dependents: ${result.dependentFiles.length}${result.dependentFiles.length > 0 ? ` (${result.dependentFiles.slice(0, 5).join(', ')}${result.dependentFiles.length > 5 ? ', …' : ''})` : ''}`,
    `- tests: ${result.testFiles.length}${result.testFiles.length > 0 ? ` (${result.testFiles.slice(0, 5).join(', ')}${result.testFiles.length > 5 ? ', …' : ''})` : ''}`,
    `- configs: ${result.configFiles.length}${result.configFiles.length > 0 ? ` (${result.configFiles.slice(0, 5).join(', ')})` : ''}`,
    'Reasons:',
    ...result.reasons.map((r) => `  - ${r}`),
  ];
  return lines.join('\n');
};
