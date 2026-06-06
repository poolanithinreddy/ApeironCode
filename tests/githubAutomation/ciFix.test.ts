import {describe, it, expect, vi} from 'vitest';
import {GitHubClient} from '../../src/connectors/github/client.js';
import {runCiFixAutomation} from '../../src/githubAutomation/ciFix.js';
import {loadAutomationPermissionsFromEnv} from '../../src/githubAutomation/permissions.js';

const buildMockClient = (responses: Record<string, unknown>, calls: string[]): GitHubClient => {
  const fetchImpl = vi.fn((url: string, init?: {body?: string; method?: string}) => {
    const path = url.replace('https://api.github.com/repos/o/r', '');
    const cleanPath = path.split('?')[0] || '/';
    const key = `${init?.method ?? 'GET'} ${cleanPath}`;
    calls.push(key);
    const body = responses[key];
    if (body === undefined) {
      return Promise.resolve(new Response(JSON.stringify({}), {status: 404, statusText: 'Not Found'}));
    }
    return Promise.resolve(new Response(JSON.stringify(body), {status: 200, statusText: 'OK'}));
  });
  return new GitHubClient({
    env: {GITHUB_TOKEN: 'tok'},
    fetchImpl: fetchImpl as unknown as typeof fetch,
    repo: {name: 'r', owner: 'o', remoteUrl: ''},
  });
};

describe('runCiFixAutomation', () => {
  it('reports succeeded with no failures', async () => {
    const client = buildMockClient({
      'GET /commits/abc/check-runs': {check_runs: [{name: 'lint', conclusion: 'success', status: 'completed'}]},
    }, []);
    const result = await runCiFixAutomation({
      client,
      config: loadAutomationPermissionsFromEnv({}),
      options: {dryRun: true},
      ref: 'abc',
    });
    expect(result.status).toBe('succeeded');
    expect(result.message).toContain('No failing checks');
  });

  it('runs in dry-run when failures present', async () => {
    const calls: string[] = [];
    const client = buildMockClient({
      'GET /commits/sha1/check-runs': {check_runs: [
        {id: 99, name: 'unit', conclusion: 'failure', status: 'completed', output: {summary: 'tests broke'}},
      ]},
      'GET /check-runs/99/annotations': [{
        annotation_level: 'failure',
        message: 'expected true to be false',
        path: 'src/a.test.ts',
        raw_details: 'AssertionError at src/a.test.ts:12',
        start_line: 12,
        title: 'unit failure',
      }],
    }, calls);
    const result = await runCiFixAutomation({
      client,
      config: loadAutomationPermissionsFromEnv({}),
      options: {dryRun: true},
      ref: 'sha1',
      runAgent: (context) => {
        expect(context.summary).toContain('src/a.test.ts:12');
        expect(context.summary).toContain('expected true');
        return Promise.resolve({patched: 1, summary: 'fixed flaky test'});
      },
    });
    expect(result.status).toBe('succeeded');
    expect(result.dryRun).toBe(true);
    expect(calls).not.toContain('POST /git/refs');
  });

  it('requires ref or prNumber', async () => {
    const client = buildMockClient({}, []);
    const result = await runCiFixAutomation({
      client,
      config: loadAutomationPermissionsFromEnv({}),
      options: {dryRun: true},
    });
    expect(result.status).toBe('failed');
    expect(result.message).toContain('PR number or an explicit ref');
  });
});
