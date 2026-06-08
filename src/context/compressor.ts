import type {AgentMode} from '../agent/types.js';
import {estimateTokens} from '../tokens/estimate.js';

export interface ContextCompressionOptions {
  maxFullFiles: number;
  maxSummaryFiles: number;
  maxTokens: number;
  preserveFiles?: string[];
  mode?: AgentMode;
}

export interface ContextFileBlock {
  path: string;
  content: string;
  reason?: string;
  score?: number;
}

export interface CompressedContext {
  fullFiles: Array<{path: string; content: string; reason: string}>;
  summarizedFiles: Array<{path: string; summary: string; reason: string}>;
  omittedFiles: Array<{path: string; reason: string}>;
  tokenEstimate: number;
  compressionRatio: number;
  explanation: string;
}

const importantLinePattern = /^\s*(?:import|export|class|interface|type|function|const|let|var|async function)\b|TODO|FIXME|throw new|Error\b|expect\(|describe\(|it\(/u;

export const dedupeContextBlocks = (blocks: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const block of blocks) {
    const key = block.trim().replace(/\s+/gu, ' ');
    if (key && !seen.has(key)) {
      seen.add(key);
      result.push(block);
    }
  }
  return result;
};

export const summarizeFileForContext = (
  path: string,
  content: string,
  options: Pick<ContextCompressionOptions, 'maxTokens' | 'mode'>,
): string => {
  const lines = content.split(/\r?\n/u);
  const selected: string[] = [];
  for (const [index, line] of lines.entries()) {
    if (importantLinePattern.test(line)) {
      selected.push(`${index + 1}: ${line.trim()}`);
    }
  }
  const fallback = lines.slice(0, 12).map((line, index) => `${index + 1}: ${line.trim()}`);
  const summaryLines = dedupeContextBlocks(selected.length > 0 ? selected : fallback).slice(0, Math.max(8, options.maxTokens / 12));
  return [
    `FILE SUMMARY: ${path}`,
    `Mode: ${options.mode ?? 'default'}`,
    ...summaryLines,
  ].join('\n');
};

const mustPreserve = (file: ContextFileBlock, options: ContextCompressionOptions): boolean => {
  const preserve = new Set(options.preserveFiles ?? []);
  return preserve.has(file.path) ||
    file.reason?.includes('changed-file') === true ||
    file.reason?.includes('lsp-diagnostics') === true ||
    /fail|error|diagnostic/u.test(file.reason ?? '');
};

export const compressProjectContext = (
  context: ContextFileBlock[],
  options: ContextCompressionOptions,
): CompressedContext => {
  const sorted = [...context].sort((left, right) => {
    const preserveDelta = Number(mustPreserve(right, options)) - Number(mustPreserve(left, options));
    return preserveDelta || (right.score ?? 0) - (left.score ?? 0) || left.path.localeCompare(right.path);
  });
  const originalTokens = sorted.reduce((sum, file) => sum + estimateTokens(file.content), 0);
  const fullFiles: CompressedContext['fullFiles'] = [];
  const summarizedFiles: CompressedContext['summarizedFiles'] = [];
  const omittedFiles: CompressedContext['omittedFiles'] = [];
  let usedTokens = 0;

  for (const file of sorted) {
    const fileTokens = estimateTokens(file.content);
    const reason = file.reason ?? 'ranked context';
    if (mustPreserve(file, options) || (fullFiles.length < options.maxFullFiles && usedTokens + fileTokens <= options.maxTokens)) {
      fullFiles.push({content: file.content, path: file.path, reason});
      usedTokens += fileTokens;
      continue;
    }
    if (summarizedFiles.length < options.maxSummaryFiles) {
      const summary = summarizeFileForContext(file.path, file.content, options);
      const summaryTokens = estimateTokens(summary);
      if (usedTokens + summaryTokens <= options.maxTokens) {
        summarizedFiles.push({path: file.path, reason: `${reason}; summarized`, summary});
        usedTokens += summaryTokens;
        continue;
      }
    }
    omittedFiles.push({path: file.path, reason: 'below context budget after higher-signal files'});
  }

  return {
    compressionRatio: originalTokens === 0 ? 1 : Number((usedTokens / originalTokens).toFixed(3)),
    explanation: `${fullFiles.length} full, ${summarizedFiles.length} summarized, ${omittedFiles.length} omitted`,
    fullFiles,
    omittedFiles,
    summarizedFiles,
    tokenEstimate: usedTokens,
  };
};
