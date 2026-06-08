import {describe, it, expect, vi} from 'vitest';
import {parseRawActionEvent} from '../../src/githubAction/events.js';
import {loadActionConfigFromEnv} from '../../src/githubAction/config.js';
import {runActionFromEvent} from '../../src/githubAction/runner.js';

const buildEnv = (extra: Record<string, string | undefined> = {}) => ({
  GITHUB_REPOSITORY: 'octo/example',
  GITHUB_TOKEN: 'tok',
  ...extra,
});

const stubFetch = (responses: Record<string, unknown>) => {
  return vi.fn((url: string, init?: {method?: string}) => {
    const path = url.replace('https://api.github.com/repos/octo/example', '');
    const cleanPath = path.split('?')[0] || '/';
    const key = `${init?.method ?? 'GET'} ${cleanPath}`;
    const body = responses[key];
    if (body === undefined) {
      return Promise.resolve(new Response(JSON.stringify({}), {status: 404, statusText: 'Not Found'}));
    }
    return Promise.resolve(new Response(JSON.stringify(body), {status: 200, statusText: 'OK'}));
  });
};

describe('action runner', () => {
  const originalFetch = global.fetch;

  it('parses issue_comment event and routes to mention workflow', async () => {
    const event = parseRawActionEvent('issue_comment', JSON.stringify({
      action: 'created',
      comment: {body: '@opencode review please', id: 1},
      issue: {number: 9, pull_request: {url: 'x'}},
      repository: {full_name: 'octo/example'},
    }));
    expect(event.context.eventType).toBe('issue_comment');
    expect(event.context.commentBody).toContain('@opencode');

    const env = buildEnv({INPUT_DRY_RUN: 'true'});
    const config = loadActionConfigFromEnv(env);
    expect(config.dryRun).toBe(true);

    global.fetch = stubFetch({
      'GET /pulls/9': {base: {ref: 'main'}, head: {ref: 'br'}, html_url: 'u', labels: [], number: 9, state: 'open', title: 'PR'},
      'GET /pulls/9/files': [],
    }) as unknown as typeof fetch;

    try {
      const result = await runActionFromEvent({config, event, env});
      expect(result.workflow).toBe('pr-review');
      expect(result.dryRun).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('returns failure when issue number missing for issue mode', async () => {
    const event = parseRawActionEvent('issue_comment', JSON.stringify({comment: {body: 'no mention'}}));
    const config = loadActionConfigFromEnv(buildEnv({INPUT_MODE: 'issue-to-pr'}));
    const result = await runActionFromEvent({config, event, env: buildEnv()});
    expect(result.status).toBe('failed');
  });

  it('rejects unknown mention commands safely', async () => {
    const event = parseRawActionEvent('issue_comment', JSON.stringify({
      comment: {body: '@opencode launch-rocket'},
      issue: {number: 4},
      repository: {full_name: 'octo/example'},
    }));
    const config = loadActionConfigFromEnv(buildEnv());
    const result = await runActionFromEvent({config, event, env: buildEnv()});
    expect(result.status).toBe('skipped');
    expect(result.workflow).toBe('mention-command');
  });

  it('forces fork pull request events into dry-run safety', async () => {
    const event = parseRawActionEvent('pull_request', JSON.stringify({
      pull_request: {
        base: {protected: false, repo: {full_name: 'octo/example'}},
        head: {repo: {fork: true, full_name: 'contrib/example'}, sha: 'abc'},
        number: 10,
      },
      repository: {full_name: 'octo/example'},
      sender: {login: 'octocat'},
    }));
    global.fetch = stubFetch({
      'GET /pulls/10': {base: {ref: 'main'}, head: {ref: 'br'}, html_url: 'u', labels: [], number: 10, state: 'open', title: 'Fork PR'},
      'GET /pulls/10/files': [],
    }) as unknown as typeof fetch;
    try {
      const result = await runActionFromEvent({
        config: loadActionConfigFromEnv(buildEnv({INPUT_DRY_RUN: 'false'})),
        env: buildEnv({OPENCODE_AUTOMATION: '1', OPENCODE_AUTOMATION_REVIEW: '1'}),
        event,
      });
      expect(result.workflow).toBe('pr-review');
      expect(result.dryRun).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('skips replayed comments that contain the action run marker', async () => {
    const event = parseRawActionEvent('issue_comment', JSON.stringify({
      comment: {body: '@opencode review\n<!-- opencode-automation-run -->'},
      issue: {number: 4, pull_request: {url: 'x'}},
      repository: {full_name: 'octo/example'},
    }));
    const result = await runActionFromEvent({config: loadActionConfigFromEnv(buildEnv()), event, env: buildEnv()});
    expect(result.status).toBe('skipped');
    expect(result.message).toContain('Duplicate');
  });
});
