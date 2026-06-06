import {describe, expect, it, vi} from 'vitest';

import {
  addLinearIssueComment,
  createLinearIssue,
  getLinearIssue,
  getLinearProject,
  LinearClient,
  listLinearIssues,
  listLinearProjects,
  updateLinearIssue,
} from '../../src/connectors/linear/index.js';

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  new Response(JSON.stringify(body), {status, statusText: ok ? 'OK' : 'Bad Request'});

const requestUrl = (url: Parameters<typeof fetch>[0]): string =>
  typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

const requestBody = (init: Parameters<typeof fetch>[1]): string =>
  typeof init?.body === 'string' ? init.body : '';

describe('Linear connector', () => {
  it('returns a clean missing token error without making network calls', async () => {
    const fetchImpl = vi.fn();
    const client = new LinearClient({env: {}, fetchImpl});

    await expect(client.request('query Test { viewer { id } }')).rejects.toThrow('LINEAR_API_KEY');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('constructs GraphQL requests and parses issue/project operations', async () => {
    const calls: Array<{body: string; headers: unknown; url: string}> = [];
    const fetchImpl = vi.fn((url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      calls.push({body: requestBody(init), headers: init?.headers, url: requestUrl(url)});
      const body = requestBody(init);
      if (body.includes('Issues')) {
        return Promise.resolve(jsonResponse({data: {issues: {nodes: [{id: 'i1', identifier: 'ENG-1', title: 'Bug'}]}}}));
      }
      if (body.includes('query Issue')) {
        return Promise.resolve(jsonResponse({data: {issue: {id: 'i1', identifier: 'ENG-1', title: 'Bug'}}}));
      }
      if (body.includes('IssueCreate')) {
        return Promise.resolve(jsonResponse({data: {issueCreate: {issue: {id: 'i2', identifier: 'ENG-2'}, success: true}}}));
      }
      if (body.includes('IssueUpdate')) {
        return Promise.resolve(jsonResponse({data: {issueUpdate: {issue: {id: 'i1', identifier: 'ENG-1'}, success: true}}}));
      }
      if (body.includes('CommentCreate')) {
        return Promise.resolve(jsonResponse({data: {commentCreate: {comment: {body: 'hi', id: 'c1'}, success: true}}}));
      }
      if (body.includes('Projects')) {
        return Promise.resolve(jsonResponse({data: {projects: {nodes: [{id: 'p1', name: 'Roadmap'}]}}}));
      }
      return Promise.resolve(jsonResponse({data: {project: {id: 'p1', name: 'Roadmap'}}}));
    });
    const client = new LinearClient({env: {LINEAR_API_KEY: 'linear-secret'}, fetchImpl});

    expect(await listLinearIssues(client)).toMatchObject([{identifier: 'ENG-1'}]);
    expect(await getLinearIssue(client, 'ENG-1')).toMatchObject({id: 'i1'});
    expect(await createLinearIssue(client, {teamId: 'team', title: 'New'})).toMatchObject({identifier: 'ENG-2'});
    expect(await updateLinearIssue(client, 'i1', {title: 'Updated'})).toMatchObject({identifier: 'ENG-1'});
    expect(await addLinearIssueComment(client, 'i1', 'hi')).toMatchObject({id: 'c1'});
    expect(await listLinearProjects(client)).toMatchObject([{name: 'Roadmap'}]);
    expect(await getLinearProject(client, 'p1')).toMatchObject({id: 'p1'});

    expect(calls[0]?.url).toBe('https://api.linear.app/graphql');
    expect(JSON.parse(calls[2]?.body ?? '{}')).toMatchObject({variables: {input: {teamId: 'team', title: 'New'}}});
    expect(JSON.stringify(calls)).toContain('authorization');
  });

  it('normalizes GraphQL errors and redacts secrets', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(jsonResponse({errors: [{message: 'token linear-secret failed'}]})),
    );
    const client = new LinearClient({env: {LINEAR_API_KEY: 'linear-secret'}, fetchImpl});

    await expect(client.request('query Broken { x }')).rejects.toThrow('[REDACTED]');
    await expect(client.request('query Broken { x }')).rejects.not.toThrow('linear-secret');
  });
});
