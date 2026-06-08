import type {AgentMode} from '../agent/types.js';
import type {ImportGraph} from './importGraph.js';
import type {GitContext} from './gitContext.js';
import type {SymbolGraph} from './symbolGraph.js';
import type {TestSourceMap} from './testMapper.js';
import type {ContextPlan} from './contextPlan.js';
import type {AffectedFileResult} from './affectedFiles.js';
import type {FrameworkHint} from './repoMap.js';

export interface FileRelevanceComponents {
  changedFile: number;
  gitRecency: number;
  importGraph: number;
  lspDiagnostics: number;
  memoryRelevance: number;
  nameMatch: number;
  promptTermMatch: number;
}

export interface FileRelevanceSignal {
  components: FileRelevanceComponents;
  path: string;
  score: number;
  signals: string[];
}

export interface RankingContext {
  cwd: string;
  prompt: string;
  mode?: AgentMode;
  importGraph?: ImportGraph;
  gitContext?: GitContext;
  memoryFileScores?: Map<string, number>;
  lspDiagnostics?: Map<string, number>;
  changedFiles?: string[];
}

const WEIGHTS = {
  nameMatch: 0.25,
  promptTermMatch: 0.20,
  importGraph: 0.15,
  gitRecency: 0.15,
  memoryRelevance: 0.15,
  lspDiagnostics: 0.05,
  changedFile: 0.05,
};

const extractTerms = (text: string): Set<string> => {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9_.-]+/u)
      .filter((word) => word.length >= 2),
  );
};

const normalizeScore = (value: number): number => {
  return Math.max(0, Math.min(1, value));
};

const calculateNameMatch = (filePath: string, promptTerms: Set<string>): number => {
  let score = 0;
  const fileName = filePath.split('/').pop() ?? '';
  const fileTerms = extractTerms(fileName);

  for (const term of promptTerms) {
    if (fileTerms.has(term)) {
      score += 1;
    }
  }

  return normalizeScore(score / Math.max(1, promptTerms.size));
};

const calculatePromptTermMatch = (
  filePath: string,
  prompt: string,
  promptTerms: Set<string>,
): number => {
  const lowerPath = filePath.toLowerCase();
  let matches = 0;

  for (const term of promptTerms) {
    if (lowerPath.includes(term)) {
      matches += 1;
    }
  }

  return normalizeScore(matches / Math.max(1, promptTerms.size));
};

const calculateImportGraphScore = (
  filePath: string,
  importGraph: ImportGraph | undefined,
  changedFiles: string[] = [],
): number => {
  if (!importGraph) {
    return 0;
  }

  let score = 0;

  // If this file was changed, boost it
  if (changedFiles.includes(filePath)) {
    score += 0.5;
  }

  // Check if this file depends on changed files
  const deps = importGraph.get(filePath);
  if (deps) {
    for (const dep of deps) {
      if (changedFiles.includes(dep)) {
        score += 0.3;
        break;
      }
    }
  }

  // Check if changed files depend on this file
  for (const changedFile of changedFiles) {
    const changedDeps = importGraph.get(changedFile);
    if (changedDeps?.has(filePath)) {
      score += 0.2;
      break;
    }
  }

  return normalizeScore(score);
};

const calculateGitRecencyScore = (
  filePath: string,
  gitContext: GitContext | undefined,
): number => {
  if (!gitContext) {
    return 0;
  }

  let score = 0;

  if (gitContext.uncommittedFiles.includes(filePath)) {
    score += 0.6;
  } else if (gitContext.stagedFiles.includes(filePath)) {
    score += 0.5;
  }

  if (gitContext.recentFiles.includes(filePath)) {
    score += 0.3;
  }

  return normalizeScore(score);
};

const calculateMemoryRelevanceScore = (
  filePath: string,
  memoryScores: Map<string, number> | undefined,
): number => {
  if (!memoryScores) {
    return 0;
  }

  return normalizeScore(memoryScores.get(filePath) ?? 0);
};

const calculateLspDiagnosticsScore = (
  filePath: string,
  diagnostics: Map<string, number> | undefined,
  mode: AgentMode | undefined,
): number => {
  if (!diagnostics) {
    return 0;
  }

  const baseScore = normalizeScore(diagnostics.get(filePath) ?? 0);

  // Boost diagnostics score in debug/fix/test-fix mode
  if (mode === 'debug' || mode === 'fix' || mode === 'test-fix') {
    return normalizeScore(baseScore * 1.5);
  }

  return baseScore;
};

export const rankFiles = (
  files: string[],
  prompt: string,
  context: RankingContext,
): FileRelevanceSignal[] => {
  if (files.length === 0) {
    return [];
  }

  const promptTerms = extractTerms(prompt);

  const signals = files.map((file): FileRelevanceSignal => {
    const components: FileRelevanceComponents = {
      changedFile: context.changedFiles?.includes(file) ? 1 : 0,
      gitRecency: calculateGitRecencyScore(file, context.gitContext),
      importGraph: calculateImportGraphScore(file, context.importGraph, context.changedFiles),
      lspDiagnostics: calculateLspDiagnosticsScore(file, context.lspDiagnostics, context.mode),
      memoryRelevance: calculateMemoryRelevanceScore(file, context.memoryFileScores),
      nameMatch: calculateNameMatch(file, promptTerms),
      promptTermMatch: calculatePromptTermMatch(file, prompt, promptTerms),
    };

    // Calculate weighted score
    const score =
      components.nameMatch * WEIGHTS.nameMatch +
      components.promptTermMatch * WEIGHTS.promptTermMatch +
      components.importGraph * WEIGHTS.importGraph +
      components.gitRecency * WEIGHTS.gitRecency +
      components.memoryRelevance * WEIGHTS.memoryRelevance +
      components.lspDiagnostics * WEIGHTS.lspDiagnostics +
      components.changedFile * WEIGHTS.changedFile;

    const signals: string[] = [];
    if (components.nameMatch > 0.3) {
      signals.push('name-match');
    }
    if (components.promptTermMatch > 0.3) {
      signals.push('prompt-term-match');
    }
    if (components.importGraph > 0.3) {
      signals.push('import-graph');
    }
    if (components.gitRecency > 0.3) {
      signals.push('git-recency');
    }
    if (components.memoryRelevance > 0.3) {
      signals.push('memory-relevant');
    }
    if (components.lspDiagnostics > 0.3) {
      signals.push('lsp-diagnostics');
    }
    if (components.changedFile > 0.5) {
      signals.push('changed-file');
    }

    return {
      components,
      path: file,
      score: normalizeScore(score),
      signals,
    };
  });

  return signals.sort((a, b) => b.score - a.score);
};

export interface FileRelevanceComponentsV2 extends FileRelevanceComponents {
  affectedFile: number;
  contextPlan: number;
  failureSignal: number;
  frameworkRelevance: number;
  symbolNameMatch: number;
  symbolReference: number;
  testRelation: number;
}

export interface FileRelevanceSignalV2 extends Omit<FileRelevanceSignal, 'components'> {
  components: FileRelevanceComponentsV2;
}

export interface RankingContextV2 extends RankingContext {
  affected?: AffectedFileResult;
  contextPlan?: ContextPlan;
  failureFileScores?: Map<string, number>;
  frameworkHints?: FrameworkHint[];
  symbolGraph?: SymbolGraph;
  symbolQueryMatches?: Set<string>;
  testSourceMap?: TestSourceMap;
  weights?: Partial<Record<keyof FileRelevanceComponentsV2, number>>;
}

const DEFAULT_V2_WEIGHTS: Record<keyof FileRelevanceComponentsV2, number> = {
  changedFile: 0.05,
  gitRecency: 0.10,
  importGraph: 0.10,
  lspDiagnostics: 0.05,
  memoryRelevance: 0.10,
  nameMatch: 0.15,
  promptTermMatch: 0.10,
  affectedFile: 0.07,
  contextPlan: 0.08,
  failureSignal: 0.10,
  frameworkRelevance: 0.02,
  symbolNameMatch: 0.05,
  symbolReference: 0.04,
  testRelation: 0.04,
};

const MODE_WEIGHT_OVERRIDES: Partial<Record<AgentMode, Partial<Record<keyof FileRelevanceComponentsV2, number>>>> = {
  debug: {failureSignal: 0.18, lspDiagnostics: 0.10},
  review: {gitRecency: 0.18, changedFile: 0.10},
  refactor: {symbolReference: 0.10, importGraph: 0.15},
  'test-fix': {failureSignal: 0.20, testRelation: 0.10},
  fix: {failureSignal: 0.16},
};

const calculateSymbolNameMatch = (filePath: string, symbolFiles?: Set<string>): number => {
  if (!symbolFiles || symbolFiles.size === 0) return 0;
  return symbolFiles.has(filePath) ? 1 : 0;
};

const calculateSymbolReferenceScore = (filePath: string, graph?: SymbolGraph): number => {
  if (!graph) return 0;
  let count = 0;
  for (const ref of graph.references) {
    if (ref.fromFile === filePath || ref.toFile === filePath) count += 1;
  }
  return normalizeScore(count / 8);
};

const calculateTestRelation = (filePath: string, testMap?: TestSourceMap): number => {
  if (!testMap) return 0;
  if (testMap.sourceForTest.has(filePath)) return 0.7;
  if (testMap.testsForSource.has(filePath)) return 0.5;
  return 0;
};

const calculateAffectedRelation = (filePath: string, affected?: AffectedFileResult): number => {
  if (!affected) return 0;
  if (affected.directFiles.includes(filePath)) return 1;
  if (affected.testFiles.includes(filePath)) return 0.7;
  if (affected.dependentFiles.includes(filePath)) return 0.5;
  if (affected.configFiles.includes(filePath)) return 0.3;
  return 0;
};

const calculateContextPlanScore = (filePath: string, plan?: ContextPlan): number => {
  if (!plan) return 0;
  if (plan.fullFiles.includes(filePath)) return 1;
  if (plan.testFiles.includes(filePath)) return 0.8;
  if (plan.summaryFiles.includes(filePath)) return 0.6;
  if (plan.relatedFiles.includes(filePath)) return 0.3;
  if (plan.excludedFiles.some((e) => e.path === filePath)) return -0.5;
  return 0;
};

const calculateFailureScore = (filePath: string, scores?: Map<string, number>): number => {
  if (!scores) return 0;
  const raw = scores.get(filePath) ?? 0;
  return normalizeScore(raw / 2);
};

const calculateFrameworkRelevance = (filePath: string, hints?: FrameworkHint[]): number => {
  if (!hints || hints.length === 0) return 0;
  const top = hints[0];
  if (!top || top.confidence < 0.5) return 0;
  if (top.framework === 'react' || top.framework === 'next') {
    if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) return 0.5;
  }
  if (top.framework === 'python' && filePath.endsWith('.py')) return 0.5;
  if (top.framework === 'go' && filePath.endsWith('.go')) return 0.5;
  if (top.framework === 'java' && filePath.endsWith('.java')) return 0.5;
  return 0;
};

export const rankFilesV2 = (
  files: string[],
  prompt: string,
  context: RankingContextV2,
): FileRelevanceSignalV2[] => {
  if (files.length === 0) return [];
  const promptTerms = extractTerms(prompt);
  const weights: Record<keyof FileRelevanceComponentsV2, number> = {
    ...DEFAULT_V2_WEIGHTS,
    ...(context.mode ? MODE_WEIGHT_OVERRIDES[context.mode] ?? {} : {}),
    ...(context.weights ?? {}),
  };

  const signals: FileRelevanceSignalV2[] = files.map((file): FileRelevanceSignalV2 => {
    const components: FileRelevanceComponentsV2 = {
      changedFile: context.changedFiles?.includes(file) ? 1 : 0,
      gitRecency: calculateGitRecencyScore(file, context.gitContext),
      importGraph: calculateImportGraphScore(file, context.importGraph, context.changedFiles),
      lspDiagnostics: calculateLspDiagnosticsScore(file, context.lspDiagnostics, context.mode),
      memoryRelevance: calculateMemoryRelevanceScore(file, context.memoryFileScores),
      nameMatch: calculateNameMatch(file, promptTerms),
      promptTermMatch: calculatePromptTermMatch(file, prompt, promptTerms),
      affectedFile: calculateAffectedRelation(file, context.affected),
      contextPlan: calculateContextPlanScore(file, context.contextPlan),
      failureSignal: calculateFailureScore(file, context.failureFileScores),
      frameworkRelevance: calculateFrameworkRelevance(file, context.frameworkHints),
      symbolNameMatch: calculateSymbolNameMatch(file, context.symbolQueryMatches),
      symbolReference: calculateSymbolReferenceScore(file, context.symbolGraph),
      testRelation: calculateTestRelation(file, context.testSourceMap),
    };

    let score = 0;
    for (const [key, weight] of Object.entries(weights) as Array<[keyof FileRelevanceComponentsV2, number]>) {
      score += components[key] * weight;
    }

    const reasons: string[] = [];
    if (components.contextPlan >= 1) reasons.push('plan-full');
    else if (components.contextPlan >= 0.6) reasons.push('plan-summary');
    if (components.failureSignal > 0.2) reasons.push('failure-signal');
    if (components.symbolNameMatch > 0) reasons.push('symbol-name-match');
    if (components.symbolReference > 0.2) reasons.push('symbol-reference');
    if (components.testRelation > 0.2) reasons.push('test-relation');
    if (components.affectedFile > 0.2) reasons.push('affected');
    if (components.changedFile > 0.5) reasons.push('changed-file');
    if (components.gitRecency > 0.3) reasons.push('git-recency');
    if (components.nameMatch > 0.3) reasons.push('name-match');
    if (components.promptTermMatch > 0.3) reasons.push('prompt-term-match');
    if (components.importGraph > 0.3) reasons.push('import-graph');
    if (components.memoryRelevance > 0.3) reasons.push('memory-relevant');
    if (components.lspDiagnostics > 0.3) reasons.push('lsp-diagnostics');
    if (components.frameworkRelevance > 0.3) reasons.push('framework-relevance');

    return {
      components,
      path: file,
      score: Math.max(0, score),
      signals: reasons,
    };
  });

  return signals.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
};

export const explainRankSignal = (signal: FileRelevanceSignalV2): string => {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(signal.components) as Array<[keyof FileRelevanceComponentsV2, number]>) {
    if (value > 0) parts.push(`${key}=${value.toFixed(2)}`);
  }
  return `${signal.path} score=${signal.score.toFixed(3)} [${signal.signals.join(', ') || 'no signals'}] (${parts.join(', ')})`;
};
