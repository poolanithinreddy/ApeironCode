/**
 * Deterministic workspace file inspection.
 *
 * The runtime — never the model — reads known/relevant files with valid,
 * bounded paths before asking the provider for a file plan. This removes the
 * failure where the model emitted a `read_file` call with no `path`
 * ("read_file requires path") for files the runtime already knew about.
 */
import fs from 'node:fs/promises';

import {assessPath} from '../safety/pathGuard.js';
import {findAppDirectories} from './appWorkspaceDetection.js';
import type {CodingIntent} from './codingIntent.js';

export interface WorkspaceFileEntry {
  path: string;
  content: string;
  exists: boolean;
  size: number;
  error?: string;
}

const MAX_FILE_BYTES = 6_000;

/** Common app entry-point files probed when no explicit selection exists. */
export const COMMON_APP_FILES = [
  'index.html',
  'styles.css',
  'style.css',
  'app.js',
  'script.js',
  'main.js',
  'package.json',
  'src/App.tsx',
  'src/App.jsx',
  'src/App.js',
  'src/main.tsx',
  'src/index.js',
  'pages/index.js',
  'pages/index.tsx',
  'pages/_app.js',
  'styles/globals.css',
];

/**
 * Read the given relative workspace files deterministically. Paths are
 * validated (no traversal, no absolute/home/system paths); missing files are
 * reported safely instead of throwing. No provider call, no model input.
 */
export async function readWorkspaceFiles(
  files: readonly string[],
  context: {cwd: string},
): Promise<WorkspaceFileEntry[]> {
  const seen = new Set<string>();
  const entries: WorkspaceFileEntry[] = [];
  for (const raw of files) {
    const file = (raw ?? '').trim();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    const assessment = assessPath(context.cwd, file);
    if (assessment.outsideProject || assessment.sensitive) {
      entries.push({
        path: file,
        content: '',
        exists: false,
        size: 0,
        error: 'path outside workspace or sensitive; skipped',
      });
      continue;
    }
    try {
      const buffer = await fs.readFile(assessment.resolvedPath);
      const text = buffer.toString('utf8');
      entries.push({
        path: file,
        content: text.slice(0, MAX_FILE_BYTES),
        exists: true,
        size: buffer.byteLength,
      });
    } catch {
      entries.push({path: file, content: '', exists: false, size: 0, error: 'not found'});
    }
  }
  return entries;
}

/**
 * Build a deterministic file-content snapshot for an intent. Reads the
 * selected files first, then probes common app files, so the file-plan prompt
 * carries real contents and the model never needs to call read_file.
 */
export async function buildWorkspaceSnapshotForIntent(
  intent: Pick<CodingIntent, 'suggestedFiles'>,
  cwd: string,
  selectedFiles: readonly string[] = [],
): Promise<{snapshot: string; entries: WorkspaceFileEntry[]; inspected: string[]}> {
  // Probe common app files at the root AND inside detected app directories
  // (e.g. calculator/index.html, todo-list/pages/index.js) so nested apps are
  // inspected deterministically without any model read_file call.
  const appDirs = await findAppDirectories(cwd);
  const nested: string[] = [];
  for (const {dir} of appDirs) {
    if (!dir) continue;
    for (const file of COMMON_APP_FILES) nested.push(`${dir}/${file}`);
  }
  const candidates = Array.from(
    new Set([
      ...selectedFiles,
      ...intent.suggestedFiles,
      ...COMMON_APP_FILES,
      ...nested,
    ].map((f) => f.trim()).filter(Boolean)),
  ).slice(0, 40);

  const entries = await readWorkspaceFiles(candidates, {cwd});
  const present = entries.filter((entry) => entry.exists);
  const snapshot = present
    .map((entry) => `--- ${entry.path} ---\n${entry.content}`)
    .join('\n\n');
  return {
    snapshot,
    entries,
    inspected: present.map((entry) => entry.path),
  };
}
