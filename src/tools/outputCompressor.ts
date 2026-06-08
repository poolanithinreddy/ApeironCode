import {estimateTokens} from '../tokens/estimate.js';
import {redactSecretLikeContent} from '../memory/safety.js';

export interface ToolOutputCompressionOptions {
  maxTokens: number;
  preserveErrors: boolean;
  preserveStackTraces: boolean;
  preserveFailingTests: boolean;
}

export interface CompressedToolOutput {
  compressionReport?: string;
  content: string;
  originalTokenEstimate: number;
  compressedTokenEstimate: number;
  compressionRatio: number;
  omittedLines: number;
  preservedReasons: string[];
}

const errorPattern = /error|failed|failure|exception|traceback|assert|expected|received/iu;
const pathPattern = /\b[\w./-]+\.(?:ts|tsx|js|jsx|json|md|py|go|rs):\d+/u;
const progressPattern = /(?:^\s*\[[=\s>]+\]\s*\d+%|^\s*\d+\/\d+|downloaded|fetching|resolving|bundling|transforming)/iu;
const jsonNoisePattern = /^[[{].{200,}[\]}]$/u;

export const extractImportantLogLines = (output: string): string[] => {
  const lines = output.split(/\r?\n/u);
  return lines.filter((line) =>
    errorPattern.test(line)
    || pathPattern.test(line)
    || /^(\s*at\s+|\s*\d+\)|FAIL|PASS|Tests?:|Exit code|Command:|exitCode:)/u.test(line),
  );
};

const dedupeNoise = (lines: string[]): string[] => {
  const seen = new Map<string, number>();
  const result: string[] = [];
  for (const line of lines) {
    const key = line.trim().replace(/\d+/gu, '#');
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    if (count < 2) {
      result.push(line);
    }
  }
  return result;
};

const fitToBudget = (lines: string[], maxTokens: number): string => {
  const selected: string[] = [];
  let tokens = 0;
  for (const line of lines) {
    const lineTokens = estimateTokens(line);
    if (selected.length > 0 && tokens + lineTokens > maxTokens) {
      break;
    }
    selected.push(line);
    tokens += lineTokens;
  }
  return selected.join('\n');
};

const stripNoise = (lines: string[]): string[] =>
  lines.filter((line) => !progressPattern.test(line) && !jsonNoisePattern.test(line));

export const compressCommandOutput = (output: string, options: ToolOutputCompressionOptions): string => {
  const lines = output.split(/\r?\n/u);
  const important = options.preserveErrors ? extractImportantLogLines(output) : [];
  const head = lines.slice(0, 20);
  const tail = lines.slice(-20);
  return fitToBudget(dedupeNoise(stripNoise([...important, ...head, '...', ...tail])), options.maxTokens);
};

export const compressTestOutput = (output: string, options: ToolOutputCompressionOptions): string => {
  const lines = output.split(/\r?\n/u);
  const failing = options.preserveFailingTests
    ? lines.filter((line) => /FAIL|failed|Assertion|expected|received|Tests?:/iu.test(line))
    : [];
  const stackFrames = options.preserveStackTraces
    ? lines.filter((line) => /^\s*at\s+/u.test(line)).slice(0, 8)
    : [];
  return fitToBudget(
    dedupeNoise(stripNoise([...failing, ...extractImportantLogLines(output), ...stackFrames, ...lines.slice(-25)])),
    options.maxTokens,
  );
};

export const compressGrepOutput = (output: string, options: ToolOutputCompressionOptions): string =>
  fitToBudget(dedupeNoise(output.split(/\r?\n/u).filter(Boolean)), options.maxTokens);

export const compressToolOutput = (
  toolName: string,
  output: string,
  options: ToolOutputCompressionOptions,
): CompressedToolOutput => {
  const originalTokenEstimate = estimateTokens(output);
  let content = output;
  const preservedReasons: string[] = [];
  if (originalTokenEstimate > options.maxTokens) {
    if (/test|lint|build/u.test(toolName)) {
      content = compressTestOutput(output, options);
      preservedReasons.push('failing tests and assertions');
      if (options.preserveStackTraces) preservedReasons.push('top stack frames');
    } else if (/grep/u.test(toolName)) {
      content = compressGrepOutput(output, options);
      preservedReasons.push('matching lines');
    } else {
      content = compressCommandOutput(output, options);
      preservedReasons.push('errors, paths, command tail');
    }
  }
  content = redactSecretLikeContent(content);
  const compressedTokenEstimate = estimateTokens(content);
  const originalLines = output.split(/\r?\n/u).length;
  const compressedLines = content.split(/\r?\n/u).length;
  return {
    compressedTokenEstimate,
    compressionRatio: originalTokenEstimate === 0 ? 1 : Number((compressedTokenEstimate / originalTokenEstimate).toFixed(3)),
    compressionReport: `tool=${toolName}, saved=${Math.max(0, originalTokenEstimate - compressedTokenEstimate)}, preserved=${preservedReasons.join('; ') || 'none'}`,
    content,
    omittedLines: Math.max(0, originalLines - compressedLines),
    originalTokenEstimate,
    preservedReasons,
  };
};
