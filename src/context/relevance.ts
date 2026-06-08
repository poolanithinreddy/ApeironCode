import type {ApeironCodeConfig} from '../config/config.js';
import {applyContextBudget, estimateTokensFromBytes} from './budget.js';
import {extractRelevantSnippet} from './chunker.js';
import {loadProjectIgnorePatterns} from './ignore.js';
import {buildProjectIndex, type ProjectIndexEntry} from './indexer.js';
import type {ProjectScan} from './scanner.js';

export interface RelevantFile {
  estimatedTokens: number;
  path: string;
  reason: string[];
  score: number;
  size: number;
  snippet: string;
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'the',
  'this',
  'that',
  'with',
  'from',
  'into',
  'for',
  'your',
  'repo',
  'codebase',
  'agent',
  'please',
  'then',
  'after',
]);

export const extractKeywords = (prompt: string): string[] => {
  return Array.from(
    new Set(
      prompt
        .toLowerCase()
        .split(/[^a-z0-9_.-]+/u)
        .map((part) => part.trim())
        .filter((part) => part.length >= 3 && !STOP_WORDS.has(part)),
    ),
  ).slice(0, 12);
};

const scoreIndexEntry = (
  entry: ProjectIndexEntry,
  keywords: string[],
  projectScan: ProjectScan,
  prompt: string,
): {reason: string[]; score: number} => {
  const lowerPath = entry.path.toLowerCase();
  const lowerPrompt = prompt.toLowerCase();
  let score = 0;
  const reason: string[] = [];

  for (const keyword of keywords) {
    if (lowerPath.includes(keyword)) {
      score += lowerPath.endsWith(keyword) ? 14 : 8;
      reason.push(`path matches ${keyword}`);
    }

    if (entry.symbols.some((symbol) => symbol.toLowerCase().includes(keyword))) {
      score += 10;
      reason.push(`symbol matches ${keyword}`);
    }

    if (entry.imports.some((value) => value.toLowerCase().includes(keyword))) {
      score += 6;
      reason.push(`import matches ${keyword}`);
    }
  }

  if (projectScan.git.changedPaths.includes(entry.path)) {
    score += 7;
    reason.push('recent git change');
  }

  if (projectScan.sourceDirectories.some((directory) => lowerPath.startsWith(`${directory.toLowerCase()}/`))) {
    score += 4;
    reason.push('source directory');
  }

  if (entry.kind === 'config' && /config|doctor|provider|build|lint/u.test(lowerPrompt)) {
    score += 6;
    reason.push('config surface');
  }

  if (entry.kind === 'test' && /test|fix|failing|debug/u.test(lowerPrompt)) {
    score += 8;
    reason.push('test surface');
  }

  if (entry.kind === 'doc' && /explain|overview|architecture|docs/u.test(lowerPrompt)) {
    score += 5;
    reason.push('documentation surface');
  }

  return {reason: Array.from(new Set(reason)), score};
};

export const rankRelevantFiles = async ({
  config,
  cwd,
  projectScan,
  prompt,
}: {
  config: ApeironCodeConfig;
  cwd: string;
  projectScan: ProjectScan;
  prompt: string;
}): Promise<RelevantFile[]> => {
  const keywords = extractKeywords(prompt);
  const ignorePatterns = Array.from(new Set([...(await loadProjectIgnorePatterns(cwd)), ...config.ignoredPaths]));
  const indexEntries = await buildProjectIndex(cwd, ignorePatterns);

  const ranked = indexEntries
    .map((entry) => {
      const scored = scoreIndexEntry(entry, keywords, projectScan, prompt);
      return {
        estimatedTokens: estimateTokensFromBytes(entry.size),
        path: entry.path,
        reason: scored.reason,
        score: scored.score,
        size: entry.size,
        snippet: entry.preview
          ? extractRelevantSnippet(entry.preview, keywords)
          : `Non-text or large file (${entry.size} bytes).`,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return applyContextBudget(ranked, {
    maxBytes: config.maxFileSize * Math.max(1, Math.floor(config.maxContextFiles / 2)),
    maxFiles: config.maxContextFiles,
    maxTokens: config.maxContextFiles * 800,
  });
};