import {describe, it, expect, vi} from 'vitest';
import {
  buildRunMarker,
  formatRunMarkerComment,
  parseRunMarker,
  findExistingRunMarker,
  findExistingOpenCodePr,
  findDuplicateRunMarkerInIssue,
  dedupeReviewCommentBodies,
  markersMatch,
  type RunMarkerKey,
} from '../../src/githubAutomation/idempotency.js';
import type {GitHubClient} from '../../src/connectors/github/client.js';

const key: RunMarkerKey = {
  actor: 'octocat',
  command: 'issue-to-pr',
  issueOrPrNumber: 42,
  ref: 'deadbeef',
  repo: 'acme/widgets',
};

describe('idempotency markers', () => {
  it('round-trips a marker through formatting and parsing', () => {
    const marker = buildRunMarker(key, '2026-01-01T00:00:00.000Z');
    const text = `Some PR body\n\n${formatRunMarkerComment(marker)}\n`;
    const parsed = parseRunMarker(text);
    expect(parsed).not.toBeNull();
    expect(parsed?.command).toBe('issue-to-pr');
    expect(parsed?.repo).toBe('acme/widgets');
    expect(parsed?.issueOrPrNumber).toBe(42);
    expect(parsed?.actor).toBe('octocat');
    expect(parsed?.hash).toBe(marker.hash);
  });

  it('produces a stable hash regardless of input key order', () => {
    const a = buildRunMarker({...key, ref: undefined}, 'x');
    const b = buildRunMarker(
      {actor: 'octocat', command: 'issue-to-pr', issueOrPrNumber: 42, repo: 'acme/widgets'},
      'x',
    );
    expect(a.hash).toBe(b.hash);
  });

  it('parseRunMarker safely ignores malformed markers', () => {
    expect(parseRunMarker(undefined)).toBeNull();
    expect(parseRunMarker('no marker here')).toBeNull();
    expect(parseRunMarker('<!-- opencode-run:not-json -->')).toBeNull();
    expect(parseRunMarker('<!-- opencode-run:{"oops":1} -->')).toBeNull();
    expect(parseRunMarker('<!-- opencode-run:{"cmd":"x","repo":"a/b"} -->')).toBeNull();
  });

  it('markersMatch matches on key fields', () => {
    const m = buildRunMarker(key);
    expect(markersMatch(key, m)).toBe(true);
    expect(markersMatch({...key, command: 'pr-review'}, m)).toBe(false);
    expect(markersMatch({...key, repo: 'other/repo'}, m)).toBe(false);
  });

  it('finds existing marker among comments', () => {
    const marker = buildRunMarker(key);
    const comments = [
      {body: 'unrelated'},
      {body: `OpenCode result\n${formatRunMarkerComment(marker)}`},
    ];
    expect(findExistingRunMarker(comments, key)?.hash).toBe(marker.hash);
    expect(findExistingRunMarker(comments, {...key, issueOrPrNumber: 99})).toBeNull();
  });

  it('dedupes review comments by trimmed body', () => {
    const existing = ['  same comment  '];
    const next = [
      {body: 'same comment', path: 'a.ts'},
      {body: 'unique comment', path: 'b.ts'},
    ];
    const result = dedupeReviewCommentBodies(next, existing);
    expect(result).toHaveLength(1);
    expect(result[0]?.path).toBe('b.ts');
  });
});

const buildClient = (responses: Map<string, unknown>): GitHubClient => ({
  configured: true,
  request: vi.fn((path: string) => {
    if (responses.has(path)) {
      return Promise.resolve(responses.get(path));
    }
    for (const [k, v] of responses) {
      if (path.startsWith(k)) {
        return Promise.resolve(v);
      }
    }
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  }),
} as unknown as GitHubClient);

describe('idempotency lookups', () => {
  it('findDuplicateRunMarkerInIssue searches issue comments', async () => {
    const marker = buildRunMarker(key);
    const client = buildClient(new Map([
      ['/issues/42/comments', [{id: 1, body: `done\n${formatRunMarkerComment(marker)}`}]],
    ]));
    const found = await findDuplicateRunMarkerInIssue(client, key);
    expect(found?.hash).toBe(marker.hash);
  });

  it('findExistingOpenCodePr matches by branch name', async () => {
    const client = buildClient(new Map([
      ['/pulls?state=all&per_page=100', [
        {number: 7, head: {ref: 'opencode/issue-42'}, html_url: 'http://example/7', body: ''},
      ]],
    ]));
    const found = await findExistingOpenCodePr(client, key, 'opencode/issue-42');
    expect(found?.number).toBe(7);
  });

  it('findExistingOpenCodePr matches by marker in PR body', async () => {
    const marker = buildRunMarker(key);
    const client = buildClient(new Map([
      ['/pulls?state=all&per_page=100', [
        {number: 9, head: {ref: 'somebody/branch'}, body: `# Body\n${formatRunMarkerComment(marker)}`},
      ]],
    ]));
    const found = await findExistingOpenCodePr(client, key);
    expect(found?.number).toBe(9);
  });

  it('returns null when no duplicates', async () => {
    const client = buildClient(new Map([
      ['/pulls?state=all&per_page=100', []],
    ]));
    expect(await findExistingOpenCodePr(client, key, 'opencode/issue-42')).toBeNull();
  });

  it('marker comment never includes raw token-like values', () => {
    const marker = buildRunMarker(key);
    const text = formatRunMarkerComment(marker);
    expect(text).not.toMatch(/Bearer\s+/);
    expect(text).not.toMatch(/ghp_/);
  });
});
