import {createPatch} from 'diff';
import pc from 'picocolors';

export const formatBytes = (value: number): string => {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

export const truncate = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
};

export const formatUnifiedDiff = (
  filePath: string,
  before: string,
  after: string,
): string => {
  return createPatch(filePath, before, after, 'before', 'after', {
    context: 3,
  });
};

export const colorizeDiff = (diffText: string): string => {
  return diffText
    .split('\n')
    .map((line) => {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        return pc.green(line);
      }

      if (line.startsWith('-') && !line.startsWith('---')) {
        return pc.red(line);
      }

      if (line.startsWith('@@')) {
        return pc.cyan(line);
      }

      return line;
    })
    .join('\n');
};

export const formatHeading = (label: string): string => {
  return `${pc.bold(label)}`;
};