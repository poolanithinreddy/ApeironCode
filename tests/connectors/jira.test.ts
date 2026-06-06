import {describe, expect, it, vi} from 'vitest';

import {
  addJiraComment,
  buildJiraBasicAuthHeader,
  createJiraIssue,
  getJiraIssue,
  getJiraProject,
  JiraClient,
  listJiraProjects,
  normalizeJiraBaseUrl,
  searchJiraIssues,
  transitionJiraIssue,
} from '../../src/connectors/jira/index.js';

const env = {JIRA_API_TOKEN: 'jira-secret', JIRA_EMAIL: 'user@example.com', JIRA_HOST: 'example.atlassian.net'};
const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {status, statusText: status < 400 ? 'OK' : 'Bad Request'});

const requestUrl = (url: Parameters<typeof fetch>[0]): string =>
  typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

const requestBody = (init: Parameters<typeof fetch>[1]): string =>
  typeof init?.body === 'string' ? init.body : '';

describe('Jira connector', () => {
  it('validates missing credentials and normalizes base URLs', async () => {
    const fetchImpl = vi.fn();
    const client = new JiraClient({env: {}, fetchImpl});

    await expect(client.request('/rest/api/3/myself')).rejects.toThrow('JIRA_HOST');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(normalizeJiraBaseUrl('example.atlassian.net/')).toBe('https://example.atlassian.net');
  });

  it('constructs Basic auth and parses issue/project operations', async () => {
    const calls: Array<{body?: string; headers?: unknown; url: string}> = [];
    const fetchImpl = vi.fn((url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const urlText = requestUrl(url);
      calls.push({body: requestBody(init), headers: init?.headers, url: urlText});
      if (urlText.includes('/project/search')) {
        return Promise.resolve(jsonResponse({values: [{id: 'p1', key: 'ENG', name: 'Engineering'}]}));
      }
      if (urlText.includes('/project/ENG')) {
        return Promise.resolve(jsonResponse({id: 'p1', key: 'ENG', name: 'Engineering'}));
      }
      if (urlText.includes('/search')) {
        return Promise.resolve(jsonResponse({issues: [{fields: {summary: 'Bug'}, id: '1', key: 'ENG-1'}]}));
      }
      if (urlText.includes('/comment')) {
        return Promise.resolve(jsonResponse({id: 'c1'}));
      }
      if (urlText.includes('/transitions')) {
        return Promise.resolve(new Response(null, {status: 204, statusText: 'No Content'}));
      }
      if (urlText.endsWith('/issue')) {
        return Promise.resolve(jsonResponse({id: '2', key: 'ENG-2'}));
      }
      return Promise.resolve(jsonResponse({fields: {summary: 'Bug'}, id: '1', key: 'ENG-1'}));
    });
    const client = new JiraClient({env, fetchImpl});

    expect(buildJiraBasicAuthHeader({apiToken: 'jira-secret', baseUrl: '', email: 'user@example.com'})).toMatch(/^Basic /);
    expect(await searchJiraIssues(client, 'project = ENG')).toMatchObject([{key: 'ENG-1'}]);
    expect(await getJiraIssue(client, 'ENG-1')).toMatchObject({summary: 'Bug'});
    expect(await createJiraIssue(client, {projectKey: 'ENG', summary: 'New'})).toMatchObject({key: 'ENG-2'});
    expect(await addJiraComment(client, 'ENG-1', 'hi')).toMatchObject({id: 'c1'});
    await expect(transitionJiraIssue(client, 'ENG-1', '31')).resolves.toBeUndefined();
    expect(await listJiraProjects(client)).toMatchObject([{key: 'ENG'}]);
    expect(await getJiraProject(client, 'ENG')).toMatchObject({name: 'Engineering'});

    expect(calls[0]?.url).toContain('/rest/api/3/search');
    const authorization = (calls[0]?.headers as {authorization?: string} | undefined)?.authorization;
    expect(authorization).toMatch(/^Basic /);
    expect(JSON.parse(calls[2]?.body ?? '{}')).toMatchObject({fields: {project: {key: 'ENG'}}});
  });

  it('normalizes REST errors and redacts tokens and auth headers', async () => {
    const header = buildJiraBasicAuthHeader({apiToken: 'jira-secret', baseUrl: '', email: 'user@example.com'});
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(`bad ${header} jira-secret`, {status: 401, statusText: 'Unauthorized'})),
    );
    const client = new JiraClient({env, fetchImpl});

    await expect(client.request('/rest/api/3/issue/ENG-1')).rejects.toThrow('[REDACTED]');
    await expect(client.request('/rest/api/3/issue/ENG-1')).rejects.not.toThrow('jira-secret');
  });
});
