import type {GitHubClient} from '../connectors/github/client.js';
import {listPullRequestComments, type GitHubPullComment} from '../connectors/github/reviews.js';

const MARKER_OPEN = '<!-- apeironcode-run:';
const LEGACY_MARKER_OPEN = '<!-- opencode-run:';
const MARKER_CLOSE = ' -->';

export interface RunMarkerKey {
  actor?: string;
  command: string;
  issueOrPrNumber: number;
  ref?: string;
  repo: string;
}

export interface RunMarker extends RunMarkerKey {
  hash: string;
  timestamp: string;
}

const stableStringify = (obj: Record<string, unknown>): string => {
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (obj[k] !== undefined) {
      out[k] = obj[k];
    }
  }
  return JSON.stringify(out);
};

const fnv1a = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

export const buildRunMarker = (key: RunMarkerKey, timestamp: string = new Date().toISOString()): RunMarker => {
  const payload = stableStringify({...key});
  return {
    ...key,
    hash: fnv1a(payload),
    timestamp,
  };
};

export const formatRunMarkerComment = (marker: RunMarker): string => {
  const safe = stableStringify({
    actor: marker.actor,
    cmd: marker.command,
    h: marker.hash,
    n: marker.issueOrPrNumber,
    ref: marker.ref,
    repo: marker.repo,
    ts: marker.timestamp,
  });
  return `${MARKER_OPEN}${safe}${MARKER_CLOSE}`;
};

export const parseRunMarker = (commentBody: string | undefined | null): RunMarker | null => {
  if (!commentBody) {
    return null;
  }
  let openLen = MARKER_OPEN.length;
  let start = commentBody.indexOf(MARKER_OPEN);
  if (start === -1) {
    // Legacy fallback: recognise pre-rebrand `opencode-run:` markers so existing
    // PRs/comments continue to be deduplicated correctly.
    start = commentBody.indexOf(LEGACY_MARKER_OPEN);
    if (start === -1) {
      return null;
    }
    openLen = LEGACY_MARKER_OPEN.length;
  }
  const close = commentBody.indexOf(MARKER_CLOSE, start);
  if (close === -1) {
    return null;
  }
  const json = commentBody.slice(start + openLen, close).trim();
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (typeof parsed.cmd !== 'string' || typeof parsed.repo !== 'string' || typeof parsed.n !== 'number') {
      return null;
    }
    return {
      actor: typeof parsed.actor === 'string' ? parsed.actor : undefined,
      command: parsed.cmd,
      hash: typeof parsed.h === 'string' ? parsed.h : '',
      issueOrPrNumber: parsed.n,
      ref: typeof parsed.ref === 'string' ? parsed.ref : undefined,
      repo: parsed.repo,
      timestamp: typeof parsed.ts === 'string' ? parsed.ts : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
};

export const markersMatch = (a: RunMarkerKey, b: RunMarker): boolean => {
  if (a.repo !== b.repo) return false;
  if (a.command !== b.command) return false;
  if (a.issueOrPrNumber !== b.issueOrPrNumber) return false;
  if (a.actor !== undefined && b.actor !== undefined && a.actor !== b.actor) return false;
  if (a.ref !== undefined && b.ref !== undefined && a.ref !== b.ref) return false;
  return true;
};

export const findExistingRunMarker = (
  comments: unknown,
  key: RunMarkerKey,
): RunMarker | null => {
  if (!Array.isArray(comments)) return null;
  for (const c of comments) {
    const m = parseRunMarker((c as {body?: string} | null)?.body ?? '');
    if (m && markersMatch(key, m)) {
      return m;
    }
  }
  return null;
};

export const findDuplicateRunMarkerInIssue = async (
  client: GitHubClient,
  key: RunMarkerKey,
): Promise<RunMarker | null> => {
  const comments = await listPullRequestComments(client, key.issueOrPrNumber).catch<GitHubPullComment[]>(() => []);
  return findExistingRunMarker(comments, key);
};

interface RawPullsList {
  body?: string | null;
  head?: {ref?: string};
  html_url?: string;
  number: number;
  state?: string;
  title?: string;
}

export const findExistingApeironCodePr = async (
  client: GitHubClient,
  key: RunMarkerKey,
  branchName?: string,
): Promise<{branch?: string; htmlUrl?: string; number: number; state?: string} | null> => {
  const items = await client.request<RawPullsList[]>('/pulls?state=all&per_page=100').catch(() => [] as RawPullsList[]);
  if (!Array.isArray(items)) return null;
  for (const pr of items) {
    if (branchName && pr.head?.ref === branchName) {
      return {branch: pr.head.ref, htmlUrl: pr.html_url, number: pr.number, state: pr.state};
    }
    const marker = parseRunMarker(pr.body);
    if (marker && markersMatch(key, marker)) {
      return {branch: pr.head?.ref, htmlUrl: pr.html_url, number: pr.number, state: pr.state};
    }
  }
  return null;
};

/** @deprecated Use findExistingApeironCodePr. Compatibility alias for legacy OpenCode brand. */
export const findExistingOpenCodePr = findExistingApeironCodePr;

export const dedupeReviewCommentBodies = (
  newComments: Array<{body: string; path: string}>,
  existingBodies: string[],
): Array<{body: string; path: string}> => {
  const seen = new Set(existingBodies.map((b) => b.trim()));
  const out: Array<{body: string; path: string}> = [];
  for (const c of newComments) {
    const key = c.body.trim();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(c);
  }
  return out;
};
