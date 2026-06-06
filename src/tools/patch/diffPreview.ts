import {formatUnifiedDiff} from '../../utils/format.js';
import type {DiffPreview} from './types.js';

const DEFAULT_MAX_CHARS = 12_000;
const DEFAULT_MAX_LINES = 160;

const countDiffLines = (diff: string): {addedLines: number; removedLines: number} => {
  let addedLines = 0;
  let removedLines = 0;

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) {
      continue;
    }

    if (line.startsWith('+')) {
      addedLines += 1;
    } else if (line.startsWith('-')) {
      removedLines += 1;
    }
  }

  return {addedLines, removedLines};
};

const truncateDiff = (diff: string): {diff: string; isTruncated: boolean} => {
  const lines = diff.split('\n');
  if (diff.length <= DEFAULT_MAX_CHARS && lines.length <= DEFAULT_MAX_LINES) {
    return {diff, isTruncated: false};
  }

  const truncatedLines = lines.slice(0, DEFAULT_MAX_LINES);
  const truncated = truncatedLines.join('\n').slice(0, DEFAULT_MAX_CHARS);
  const remainingLines = Math.max(0, lines.length - DEFAULT_MAX_LINES);

  return {
    diff: `${truncated}\n... diff truncated (${remainingLines} additional lines omitted)`,
    isTruncated: true,
  };
};

export const buildDiffPreview = (
  filePath: string,
  before: string,
  after: string,
): DiffPreview => {
  const fullDiff = formatUnifiedDiff(filePath, before, after);
  const {addedLines, removedLines} = countDiffLines(fullDiff);
  const truncated = truncateDiff(fullDiff);

  return {
    addedLines,
    diff: truncated.diff,
    filePath,
    fullDiff,
    isTruncated: truncated.isTruncated,
    removedLines,
  };
};
