import fs from 'node:fs/promises';
import path from 'node:path';

import type {EvalResult, EvalRunSummary} from './types.js';

const DEFAULT_OUTPUT_DIR = '.apeironcode-agent/evals';
const SECRET_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9_]+/gu,
  /xox[baprs]-[A-Za-z0-9-]+/gu,
  /sk-[A-Za-z0-9_-]+/gu,
  /Bearer\s+[A-Za-z0-9._-]+/giu,
  /Basic\s+[A-Za-z0-9+/=]+/giu,
];

const redact = (value: string): string =>
  SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, '[REDACTED]'), value);

const resultPath = (suiteId: string, outputDir = DEFAULT_OUTPUT_DIR): string =>
  path.join(outputDir, `${suiteId}-latest.json`);

const sanitize = <T>(value: T): T =>
  JSON.parse(redact(JSON.stringify(value))) as T;

export const saveEvalResult = async (
  summary: EvalRunSummary,
  outputDir = DEFAULT_OUTPUT_DIR,
): Promise<string> => {
  const withTimestamp = sanitize({
    ...summary,
    timestamp: summary.timestamp ?? new Date().toISOString(),
  });
  await fs.mkdir(outputDir, {recursive: true});
  const target = resultPath(summary.suiteId, outputDir);
  await fs.writeFile(target, `${JSON.stringify(withTimestamp, null, 2)}\n`, 'utf8');
  return target;
};

export const loadLastEvalResult = async (
  suiteId: string,
  outputDir = DEFAULT_OUTPUT_DIR,
): Promise<EvalRunSummary | null> => {
  try {
    return JSON.parse(await fs.readFile(resultPath(suiteId, outputDir), 'utf8')) as EvalRunSummary;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

export const formatEvalResult = (result: EvalResult): string => {
  const status = result.passed ? 'PASS' : 'FAIL';
  const lines = [`- ${result.id}: ${status} (${result.durationMs}ms)`];
  if (result.toolCalls.length > 0) {
    lines.push(`  tools: ${result.toolCalls.map((toolCall) => toolCall.toolName).join(', ')}`);
  }
  if (result.filesChanged.length > 0) {
    lines.push(`  files: ${result.filesChanged.join(', ')}`);
  }
  lines.push(
    `  tokens: total=${result.tokenEfficiency.totalEstimatedTokens}, schema=${result.tokenEfficiency.estimatedToolSchemaTokens}, context=${result.tokenEfficiency.estimatedContextTokens}, memory=${result.tokenEfficiency.estimatedMemoryTokens}, toolResults=${result.tokenEfficiency.estimatedToolResultTokens}`,
  );
  for (const failure of result.failures) {
    lines.push(`  failure: ${redact(failure)}`);
  }
  return lines.join('\n');
};

export const formatEvalSummary = (summary: EvalRunSummary | null): string => {
  if (!summary) {
    return 'No eval result found.';
  }
  return [
    `Eval Suite: ${summary.suiteId}`,
    `Result: ${summary.passed}/${summary.total} passed, ${summary.failed} failed`,
    `Duration: ${summary.durationMs}ms`,
    `Token Efficiency: total=${summary.tokenEfficiency.totalEstimatedTokens}, successPer1k=${summary.tokenEfficiency.successPer1kTokens}, toolCallsPer1k=${summary.tokenEfficiency.toolCallsPer1kTokens}, compression=${summary.tokenEfficiency.compressionRatio ?? 'n/a'}`,
    summary.timestamp ? `Timestamp: ${summary.timestamp}` : '',
    '',
    ...summary.results.map(formatEvalResult),
  ].filter(Boolean).join('\n');
};
