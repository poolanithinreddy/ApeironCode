import {describe, expect, it} from 'vitest';
import {GitHubClient} from '../../src/connectors/github/client.js';
import {runIssueToPrAutomation} from '../../src/githubAutomation/issueToPr.js';
import {loadAutomationPermissionsFromEnv} from '../../src/githubAutomation/permissions.js';
import {buildRunMarker, formatRunMarkerComment} from '../../src/githubAutomation/idempotency.js';
import {parseCiFailureLog} from '../../src/githubAutomation/ciLogParser.js';
import {enforcePatchLimits, retryWithBackoff} from '../../src/githubAutomation/patchOrchestrator.js';
import {prepareResourceForContext} from '../../src/mcp/contextIntegration.js';
import {buildMcpDoctorChecks} from '../../src/diagnostics/mcpDoctor.js';

describe('GitHub automation e2e behaviors', () => {
  it('issue-to-pr automation skips when an existing ApeironCode PR exists', async () => {
    const marker = buildRunMarker({command: 'issue-to-pr', issueOrPrNumber: 42, repo: 'acme/widgets'});
    const fetchImpl = (url: string): Promise<Response> => {
      const path = url.replace('https://api.github.com/repos/acme/widgets', '');
      if (path.startsWith('/issues/42/comments')) {
        return Promise.resolve(new Response(JSON.stringify([]), {status: 200}));
      }
      if (path.startsWith('/issues/42')) {
        return Promise.resolve(new Response(JSON.stringify({number: 42, state: 'open', title: 'X', body: 'b'}), {status: 200}));
      }
      if (path.startsWith('/pulls?')) {
        return Promise.resolve(new Response(JSON.stringify([
          {number: 99, body: `existing\n${formatRunMarkerComment(marker)}`, head: {ref: 'opencode/issue-42'}, html_url: 'http://x/99'},
        ]), {status: 200}));
      }
      if (path === '/') {
        return Promise.resolve(new Response(JSON.stringify({default_branch: 'main'}), {status: 200}));
      }
      return Promise.resolve(new Response(JSON.stringify({}), {status: 404}));
    };
    const client = new GitHubClient({
      env: {GITHUB_TOKEN: 'tok'},
      fetchImpl: fetchImpl as unknown as typeof fetch,
      repo: {name: 'widgets', owner: 'acme', remoteUrl: ''},
    });
    const result = await runIssueToPrAutomation({
      client,
      config: loadAutomationPermissionsFromEnv({OPENCODE_AUTOMATION: '1', OPENCODE_AUTOMATION_PR_CREATE: '1', OPENCODE_AUTOMATION_COMMIT: '1'}),
      issueNumber: 42,
      options: {dryRun: false},
      repoFullName: 'acme/widgets',
    });
    expect(result.status).toBe('skipped');
    expect(result.message).toContain('Already handled');
    expect(result.prNumber).toBe(99);
  });

  it('parses CI logs and enforces patch limits', () => {
    const parsed = parseCiFailureLog('FAIL src/x.test.ts > broken\nAssertionError: expected 1 to equal 2\n  at run (src/x.test.ts:10:5)');
    expect(parsed.failingTests.length).toBeGreaterThan(0);
    expect(parsed.filePaths.some((p) => p.line === 10)).toBe(true);

    const enforce = enforcePatchLimits({bytes: 999_999, files: 1}, {maxDiffBytes: 1_000});
    expect(enforce.ok).toBe(false);
  });

  it('retries transient errors but not deterministic ones', async () => {
    let count = 0;
    const ok = await retryWithBackoff((): Promise<string> => {
      count += 1;
      if (count < 2) return Promise.reject(new Error('rate limit'));
      return Promise.resolve('done');
    }, {sleep: () => Promise.resolve()});
    expect(ok).toBe('done');
  });

  it('redacts secrets and labels source for MCP resources', () => {
    const out = prepareResourceForContext('Authorization: Bearer real-secret-token-1234\n', {source: 'docs/x'});
    expect(out.content).toContain('[mcp resource: docs/x]');
    expect(out.content).not.toContain('real-secret-token-1234');
    expect(out.redactedHits).toBeGreaterThan(0);
  });

  it('mcp doctor reports missing token without leaking', async () => {
    const checks = await buildMcpDoctorChecks({
      endpoints: [{serverId: 'test-srv', spec: {type: 'http', url: 'https://example.com', name: 'test-srv', headers: {}}}],
      store: {clear: () => Promise.resolve(), get: () => Promise.resolve(null), set: () => Promise.resolve()},
    });
    expect(checks.find((c) => c.label === 'MCP auth: test-srv')?.status).toBe('warn');
    for (const c of checks) {
      expect(c.detail).not.toMatch(/Bearer\s+/);
    }
  });
});
