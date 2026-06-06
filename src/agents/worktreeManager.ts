/**
 * ApeironCode Worktree Manager (Phase 16D).
 * Creates/lists/removes git worktrees for isolated agent tasks.
 * Never operates outside the project's worktrees root.
 * Main working tree is never modified or removed.
 * Uses existing gitWorktree utilities where possible.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {ensureDirectory, readJsonFile, writeJsonFile} from '../utils/fs.js';
import {getProjectWorktreesDir} from '../utils/paths.js';
import {isPathInside, getGitRepoRoot} from './workspace/gitWorktree.js';

export type AgentWorktreeStatus = 'active' | 'removed' | 'error';

export interface AgentWorktree {
  id: string;
  cwd: string;
  worktreePath: string;
  branchName: string;
  baseBranch: string;
  createdAt: string;
  purpose: string;
  taskId?: string;
  status: AgentWorktreeStatus;
}

export interface CreateWorktreeOptions {
  cwd: string;
  purpose: string;
  taskId?: string;
  baseBranch?: string;
  /** Injected git runner for tests. Default: real git via execa. */
  runGit?: GitRunner;
  /** Override repo root for tests (skips getGitRepoRoot). */
  repoRootOverride?: string;
}

export interface RemoveWorktreeOptions {
  id: string;
  cwd: string;
  yes: boolean;
  runGit?: GitRunner;
}

export type GitRunner = (cwd: string, args: string[]) => Promise<{stdout: string; exitCode: number}>;

const SLUG_RE = /[^a-z0-9]+/gu;
const SHORT_ID_LENGTH = 6;

export const makeSafeSlug = (text: string): string =>
  text
    .toLowerCase()
    .replace(SLUG_RE, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 40) || 'task';

export const buildBranchName = (slug: string, shortId: string): string =>
  `apeironcode/task/${slug}-${shortId}`;

const defaultGitRunner: GitRunner = async (cwd: string, args: string[]) => {
  const {execa} = await import('execa');
  try {
    const result = await execa('git', args, {cwd, reject: false});
    return {stdout: result.stdout, exitCode: result.exitCode ?? 0};
  } catch {
    return {stdout: '', exitCode: 1};
  }
};

const storeDir = (cwd: string): string => getProjectWorktreesDir(cwd);
const recordPath = (cwd: string, id: string): string => path.join(storeDir(cwd), `${id}.json`);

export const createAgentWorktree = async (options: CreateWorktreeOptions): Promise<AgentWorktree> => {
  const {cwd, purpose, taskId} = options;
  const runGit = options.runGit ?? defaultGitRunner;

  const repoRoot = options.repoRootOverride ?? await getGitRepoRoot(cwd);
  if (!repoRoot) {
    throw new Error('Agent worktrees require a git repository. Ensure the project is initialized with git.');
  }

  // Check current branch for baseBranch default
  const branchResult = await runGit(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const baseBranch = options.baseBranch ?? (branchResult.stdout.trim() || 'main');

  const shortId = crypto.randomBytes(3).toString('hex').slice(0, SHORT_ID_LENGTH);
  const slug = makeSafeSlug(purpose);
  const branchName = buildBranchName(slug, shortId);
  const id = crypto.randomUUID();

  const worktreesRoot = storeDir(repoRoot);
  const worktreePath = path.join(worktreesRoot, id);

  if (!isPathInside(worktreePath, worktreesRoot)) {
    throw new Error('Refusing to create worktree outside the project worktrees directory.');
  }

  await ensureDirectory(path.dirname(worktreePath));

  // Create branch and worktree
  const addResult = await runGit(repoRoot, [
    'worktree', 'add', '-b', branchName, worktreePath, baseBranch,
  ]);

  if (addResult.exitCode !== 0) {
    throw new Error(`git worktree add failed. Ensure the repository is clean and ${baseBranch} exists.`);
  }

  const record: AgentWorktree = {
    id,
    cwd: repoRoot,
    worktreePath,
    branchName,
    baseBranch,
    createdAt: new Date().toISOString(),
    purpose,
    taskId,
    status: 'active',
  };

  await ensureDirectory(storeDir(repoRoot));
  await writeJsonFile(recordPath(repoRoot, id), record);
  return record;
};

export const listAgentWorktrees = async (cwd: string): Promise<AgentWorktree[]> => {
  const dir = storeDir(cwd);
  try {
    const entries = await fs.readdir(dir);
    const records = await Promise.all(
      entries
        .filter((e) => e.endsWith('.json'))
        .map((e) => readJsonFile<AgentWorktree | null>(path.join(dir, e), null)),
    );
    return records
      .filter((r): r is AgentWorktree => r !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
};

export const getAgentWorktree = async (cwd: string, id: string): Promise<AgentWorktree | null> => {
  const rootCandidates = [cwd, await getGitRepoRoot(cwd) ?? cwd];
  for (const root of rootCandidates) {
    const record = await readJsonFile<AgentWorktree | null>(recordPath(root, id), null);
    if (record) return record;
  }
  return null;
};

export const removeAgentWorktree = async (options: RemoveWorktreeOptions): Promise<boolean> => {
  const {id, cwd, yes} = options;
  if (!yes) {
    throw new Error('removeAgentWorktree requires yes=true. Pass --yes to confirm removal.');
  }
  const runGit = options.runGit ?? defaultGitRunner;

  const record = await getAgentWorktree(cwd, id);
  if (!record) {
    throw new Error(`Worktree record not found: ${id}`);
  }

  const worktreesRoot = storeDir(record.cwd);
  if (!isPathInside(record.worktreePath, worktreesRoot)) {
    throw new Error(`Refusing to remove worktree outside project worktrees directory: ${record.worktreePath}`);
  }

  const removeResult = await runGit(record.cwd, ['worktree', 'remove', '--force', record.worktreePath]);
  const updated: AgentWorktree = {...record, status: 'removed'};
  await writeJsonFile(recordPath(record.cwd, id), updated);

  // Remove the branch
  await runGit(record.cwd, ['branch', '-D', record.branchName]);

  return removeResult.exitCode === 0;
};

export const formatWorktreeSummary = (wt: AgentWorktree): string => {
  const lines = [
    `Worktree: ${wt.id.slice(0, 8)}`,
    `Branch: ${wt.branchName}`,
    `Base: ${wt.baseBranch}`,
    `Path: ${wt.worktreePath}`,
    `Status: ${wt.status}`,
    `Purpose: ${wt.purpose}`,
  ];
  if (wt.taskId) lines.push(`Task: ${wt.taskId}`);
  lines.push(`Created: ${wt.createdAt.slice(0, 16).replace('T', ' ')}`);
  return lines.join('\n');
};

// ─── Worktree Reconciliation (Phase 16D.1) ───────────────────────────────────

export interface GitWorktreeEntry {
  worktree: string;
  branch?: string;
  commit?: string;
  isMain?: boolean;
}

export interface WorktreeReconciliationReport {
  worktrees: AgentWorktree[];
  /** IDs of stored worktrees not found in git worktree list. */
  missing: string[];
  /** Git worktree paths that belong to ApeironCode but not in the JSON store. */
  discovered: string[];
}

/**
 * Parse the output of `git worktree list --porcelain`.
 */
export const parseGitWorktreeList = (output: string): GitWorktreeEntry[] => {
  const entries: GitWorktreeEntry[] = [];
  let current: Partial<GitWorktreeEntry> = {};

  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.worktree) entries.push(current as GitWorktreeEntry);
      current = {worktree: line.slice('worktree '.length).trim()};
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).trim();
    } else if (line.startsWith('HEAD ')) {
      current.commit = line.slice('HEAD '.length).trim();
    } else if (line.trim() === 'bare' || line.trim() === '') {
      if (line.trim() === '' && current.worktree) {
        entries.push(current as GitWorktreeEntry);
        current = {};
      }
    }
  }
  if (current.worktree) entries.push(current as GitWorktreeEntry);
  return entries;
};

/**
 * Reconcile the JSON store with the actual git worktree list.
 * Marks stored worktrees missing if not in git output.
 * Discovers ApeironCode worktrees present in git but not in the store.
 * Never deletes anything automatically.
 */
export const reconcileAgentWorktrees = async (
  cwd: string,
  options?: {runGit?: GitRunner},
): Promise<WorktreeReconciliationReport> => {
  const runGit = options?.runGit ?? defaultGitRunner;
  const stored = await listAgentWorktrees(cwd);
  const worktreesRoot = storeDir(cwd);

  const {stdout, exitCode} = await runGit(cwd, ['worktree', 'list', '--porcelain']);
  if (exitCode !== 0) {
    // Git unavailable or not a repo — return stored list as-is
    return {worktrees: stored, missing: [], discovered: []};
  }

  const gitEntries = parseGitWorktreeList(stdout);
  const gitPaths = new Set(gitEntries.map((e) => e.worktree));

  const missing: string[] = [];
  for (const wt of stored) {
    if (wt.status === 'active' && !gitPaths.has(wt.worktreePath)) {
      missing.push(wt.id);
    }
  }

  const storedPaths = new Set(stored.map((w) => w.worktreePath));
  const discovered: string[] = [];
  for (const entry of gitEntries) {
    if (
      isPathInside(entry.worktree, worktreesRoot) &&
      !storedPaths.has(entry.worktree) &&
      entry.branch?.includes('apeironcode/task/')
    ) {
      discovered.push(entry.worktree);
    }
  }

  return {worktrees: stored, missing, discovered};
};

export const formatWorktreeReconciliationReport = (report: WorktreeReconciliationReport): string => {
  const lines: string[] = [`Worktrees: ${report.worktrees.length}`];
  if (report.missing.length > 0) {
    lines.push(`Missing from git (${report.missing.length}): ${report.missing.map((id) => id.slice(0, 8)).join(', ')}`);
  }
  if (report.discovered.length > 0) {
    lines.push(`Discovered in git but not in store (${report.discovered.length}): ${report.discovered.join(', ')}`);
  }
  if (report.missing.length === 0 && report.discovered.length === 0) {
    lines.push('All worktrees are consistent.');
  }
  return lines.join('\n');
};
