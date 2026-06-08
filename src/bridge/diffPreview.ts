/**
 * ApeironCode Bridge — Diff Preview Messages.
 * Produces bridge-safe diff summaries: no raw secrets, no huge patches.
 */

import type {BridgeMessage} from './types.js';
import {createBridgeMessage} from './types.js';
import {redactBridgePayload} from './redaction.js';

const MAX_PATCH_PREVIEW_CHARS = 3_000;
const MAX_FILES = 50;

/** Protected path prefixes — flagged in diff summaries. */
const PROTECTED_PATH_PREFIXES = [
  '.git/', '.env', '.apeironcode-agent/', 'node_modules/',
  'secret', 'credential', 'private_key', 'id_rsa', 'id_ed25519',
];

const isProtectedPath = (filePath: string): boolean =>
  PROTECTED_PATH_PREFIXES.some((prefix) =>
    filePath.startsWith(prefix) || filePath.includes(`/${prefix}`),
  );

export interface DiffFileSummary {
  path: string;
  additions: number;
  deletions: number;
  risky: boolean;
}

export interface DiffSummary {
  files: DiffFileSummary[];
  totalAdditions: number;
  totalDeletions: number;
  patchPreview: string;
  truncated: boolean;
  riskyPaths: string[];
}

export interface CreateDiffPreviewOptions {
  sessionId?: string;
  requestId?: string;
}

/**
 * Summarizes a diff string for safe display.
 * Input is a unified diff or patch string.
 */
export const summarizeDiffForBridge = (diff: string): DiffSummary => {
  const lines = diff.split('\n');
  const fileMap = new Map<string, DiffFileSummary>();
  let currentPath = '';
  let totalAdd = 0;
  let totalDel = 0;

  for (const line of lines) {
    if (line.startsWith('+++ b/') || line.startsWith('+++ ')) {
      currentPath = line.replace(/^\+\+\+ (b\/)?/, '').trim();
      if (currentPath && !fileMap.has(currentPath)) {
        fileMap.set(currentPath, {
          path: currentPath,
          additions: 0,
          deletions: 0,
          risky: isProtectedPath(currentPath),
        });
      }
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      totalAdd++;
      const entry = fileMap.get(currentPath);
      if (entry) entry.additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      totalDel++;
      const entry = fileMap.get(currentPath);
      if (entry) entry.deletions++;
    }
  }

  const files = [...fileMap.values()].slice(0, MAX_FILES);
  const riskyPaths = files.filter((f) => f.risky).map((f) => f.path);

  const rawPatch = diff.slice(0, MAX_PATCH_PREVIEW_CHARS);
  const truncated = diff.length > MAX_PATCH_PREVIEW_CHARS;
  const patchPreview = truncated ? rawPatch + '\n... [truncated]' : rawPatch;

  return {files, totalAdditions: totalAdd, totalDeletions: totalDel, patchPreview, truncated, riskyPaths};
};

/** Creates a bridge diff.preview message from a diff string. */
export const createDiffPreviewMessage = (
  diff: string,
  options: CreateDiffPreviewOptions = {},
): BridgeMessage => {
  const summary = summarizeDiffForBridge(diff);
  // Redact potential secrets from patch preview
  const safePatch = (redactBridgePayload(summary.patchPreview) as string);
  return createBridgeMessage(
    'diff.preview',
    {
      files: summary.files.map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        risky: f.risky,
      })),
      totalAdditions: summary.totalAdditions,
      totalDeletions: summary.totalDeletions,
      patchPreview: safePatch,
      truncated: summary.truncated,
      riskyPaths: summary.riskyPaths,
    },
    {sessionId: options.sessionId, requestId: options.requestId},
  );
};

/** Formats a diff summary for human-readable display. */
export const formatBridgeDiffSummary = (summary: DiffSummary): string => {
  const lines: string[] = [
    `Files changed: ${summary.files.length}`,
    `+${summary.totalAdditions} / -${summary.totalDeletions}`,
  ];
  if (summary.riskyPaths.length > 0) {
    lines.push(`⚠ Risky paths: ${summary.riskyPaths.join(', ')}`);
  }
  if (summary.truncated) lines.push('(patch preview truncated)');
  for (const f of summary.files.slice(0, 10)) {
    lines.push(`  ${f.risky ? '⚠' : ' '} ${f.path} +${f.additions}/-${f.deletions}`);
  }
  return lines.join('\n');
};
