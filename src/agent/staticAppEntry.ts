/**
 * Actual displayed-file detection for static web apps (Phase 18A, Task C).
 *
 * Dogfood showed ApeironCode could edit `styles.css` at the workspace root
 * while the user was actually opening `calculator/index.html`, which links
 * `calculator/styles.css`. The "fix" then never appeared in the browser.
 *
 * This module deterministically answers two questions, with no provider call:
 *   1. Which `index.html` is the real app entry the user is viewing?
 *   2. Which CSS/JS files does that entry actually link (and do they exist)?
 *
 * The runtime uses this to (a) target the linked files, (b) downgrade visual
 * acceptance when the wrong file was edited, and (c) tell the user exactly
 * which file to open.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import {findAppDirectories} from './appWorkspaceDetection.js';

export interface LinkedAssets {
  scripts: string[];
  styles: string[];
}

export interface StaticAppEntry {
  /** Directory of the entry ('' for workspace root, e.g. 'calculator'). */
  dir: string;
  /** Workspace-relative path to the entry HTML (e.g. 'calculator/index.html'). */
  htmlPath: string;
  /** Linked asset paths that do not exist on disk. */
  missing: string[];
  /** Linked <script src> paths, workspace-relative, local only. */
  scripts: string[];
  /** Linked <link rel=stylesheet href> paths, workspace-relative, local only. */
  styles: string[];
}

const isExternal = (href: string): boolean =>
  /^(?:https?:)?\/\//u.test(href) || href.startsWith('data:') || href.startsWith('#') || href.startsWith('mailto:');

/** Normalize a linked href to a clean workspace-relative path under `dir`. */
const resolveRelative = (dir: string, href: string): string => {
  const clean = href.split(/[?#]/u)[0]!.replace(/^\.\//u, '').trim();
  const joined = dir ? path.posix.join(dir, clean) : clean;
  return path.posix.normalize(joined).replace(/^\.\//u, '');
};

/**
 * Parse the linked stylesheets and scripts from an entry HTML string.
 * Pure (no I/O). External and inline assets are ignored. `dir` is the entry's
 * directory so relative hrefs resolve to workspace-relative paths.
 */
export const resolveLinkedAssets = (entryHtmlPath: string, html: string): LinkedAssets => {
  const dir = path.posix.dirname(entryHtmlPath.replace(/\\/gu, '/'));
  const baseDir = dir === '.' ? '' : dir;
  const styles: string[] = [];
  const scripts: string[] = [];

  for (const tag of html.match(/<link\b[^>]*>/giu) ?? []) {
    if (!/rel\s*=\s*["']?\s*stylesheet/iu.test(tag) && !/\.css\b/iu.test(tag)) continue;
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/iu)?.[1];
    if (href && !isExternal(href)) styles.push(resolveRelative(baseDir, href));
  }
  for (const tag of html.match(/<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>/giu) ?? []) {
    const src = tag.match(/src\s*=\s*["']([^"']+)["']/iu)?.[1];
    if (src && !isExternal(src)) scripts.push(resolveRelative(baseDir, src));
  }
  return {scripts: unique(scripts), styles: unique(styles)};
};

const unique = (items: string[]): string[] => Array.from(new Set(items.filter(Boolean)));

const fileExists = async (target: string): Promise<boolean> => {
  try {
    return (await fs.stat(target)).isFile();
  } catch {
    return false;
  }
};

const mtimeOf = async (target: string): Promise<number> => {
  try {
    return (await fs.stat(target)).mtimeMs;
  } catch {
    return 0;
  }
};

/** Extract explicit *.html paths mentioned in the prompt or selected files. */
const explicitHtml = (prompt: string, selectedFiles: readonly string[]): string[] => {
  const fromPrompt = Array.from(
    prompt.matchAll(/[\w./-]+\.html?\b/giu),
    (m) => m[0].replace(/^\.\//u, ''),
  );
  const fromSelected = selectedFiles.filter((f) => /\.html?$/iu.test(f));
  return unique([...fromSelected, ...fromPrompt]);
};

/** Subdirectories explicitly mentioned via a path like `calculator/styles.css`. */
const mentionedDirs = (prompt: string, selectedFiles: readonly string[]): string[] => {
  const refs = [
    ...selectedFiles,
    ...Array.from(prompt.matchAll(/[\w-]+\/[\w./-]+/giu), (m) => m[0]),
  ];
  return unique(
    refs
      .map((r) => path.posix.dirname(r.replace(/\\/gu, '/').replace(/^\.\//u, '')))
      .filter((d) => d && d !== '.'),
  );
};

const buildEntry = async (cwd: string, htmlPath: string): Promise<StaticAppEntry> => {
  const dir = path.posix.dirname(htmlPath);
  let html = '';
  try {
    html = await fs.readFile(path.join(cwd, htmlPath), 'utf8');
  } catch {
    html = '';
  }
  const {styles, scripts} = resolveLinkedAssets(htmlPath, html);
  const missing: string[] = [];
  for (const asset of [...styles, ...scripts]) {
    if (!(await fileExists(path.join(cwd, asset)))) missing.push(asset);
  }
  return {dir: dir === '.' ? '' : dir, htmlPath, missing, scripts, styles};
};

/**
 * Detect the active static-app entry HTML the user is most likely viewing.
 *
 * Priority:
 *   1. An explicit *.html in the prompt/selection that exists on disk.
 *   2. An `index.html` inside an explicitly mentioned subfolder.
 *   3. The most recently modified existing `index.html`, preferring a nested
 *      app folder over the workspace root (the folder built last turn).
 */
export const detectStaticAppEntry = async (
  cwd: string,
  selectedFiles: readonly string[],
  prompt: string,
): Promise<StaticAppEntry | null> => {
  // 1. Explicit html mention that exists.
  for (const html of explicitHtml(prompt, selectedFiles)) {
    if (await fileExists(path.join(cwd, html))) return buildEntry(cwd, html);
  }

  // 2. index.html inside an explicitly mentioned subfolder.
  for (const dir of mentionedDirs(prompt, selectedFiles)) {
    const candidate = path.posix.join(dir, 'index.html');
    if (await fileExists(path.join(cwd, candidate))) return buildEntry(cwd, candidate);
  }

  // 3. Most-recently-modified existing index.html, nested preferred over root.
  const dirs = await findAppDirectories(cwd);
  const candidates: Array<{htmlPath: string; nested: boolean; mtime: number}> = [];
  for (const {dir, hasIndexHtml} of dirs) {
    if (!hasIndexHtml) continue;
    const htmlPath = dir ? path.posix.join(dir, 'index.html') : 'index.html';
    candidates.push({htmlPath, nested: dir !== '', mtime: await mtimeOf(path.join(cwd, htmlPath))});
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (b.mtime !== a.mtime) return b.mtime - a.mtime;
    if (a.nested !== b.nested) return a.nested ? -1 : 1;
    return 0;
  });
  return buildEntry(cwd, candidates[0]!.htmlPath);
};

/** Human-readable "open this file" hint for the final summary. */
export const formatOpenHint = (entry: StaticAppEntry | null): string | null =>
  entry ? `Open ${entry.htmlPath} in your browser.` : null;
