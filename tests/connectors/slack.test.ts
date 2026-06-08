import {describe, expect, it, vi} from 'vitest';

import {
  addSlackReaction,
  getSlackChannelHistory,
  listSlackChannels,
  sendSlackMessage,
  SlackClient,
  updateSlackMessage,
} from '../../src/connectors/slack/index.js';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {status, statusText: status < 400 ? 'OK' : 'Bad Request'});

const requestUrl = (url: Parameters<typeof fetch>[0]): string =>
  typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

const requestBody = (init: Parameters<typeof fetch>[1]): string =>
  typeof init?.body === 'string' ? init.body : '';

describe('Slack connector', () => {
  it('returns a clean missing token error without network calls', async () => {
    const fetchImpl = vi.fn();
    const client = new SlackClient({env: {}, fetchImpl});

    await expect(client.call('auth.test')).rejects.toThrow('SLACK_BOT_TOKEN');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('constructs Web API requests and parses channel/message operations', async () => {
    const calls: Array<{body?: string; headers?: unknown; method?: string; url: string}> = [];
    const fetchImpl = vi.fn((url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const urlText = requestUrl(url);
      calls.push({body: requestBody(init), headers: init?.headers, method: init?.method, url: urlText});
      if (urlText.includes('conversations.list')) {
        return Promise.resolve(jsonResponse({channels: [{id: 'C1', name: 'general'}], ok: true}));
      }
      if (urlText.includes('conversations.history')) {
        return Promise.resolve(jsonResponse({messages: [{text: 'hello', ts: '1.0', user: 'U1'}], ok: true}));
      }
      if (urlText.includes('chat.postMessage')) {
        return Promise.resolve(jsonResponse({channel: 'C1', ok: true, ts: '2.0'}));
      }
      if (urlText.includes('chat.update')) {
        return Promise.resolve(jsonResponse({channel: 'C1', ok: true, ts: '2.0'}));
      }
      return Promise.resolve(jsonResponse({ok: true}));
    });
    const client = new SlackClient({env: {SLACK_BOT_TOKEN: 'xoxb-secret'}, fetchImpl});

    expect(await listSlackChannels(client)).toMatchObject([{id: 'C1'}]);
    expect(await getSlackChannelHistory(client, 'C1')).toMatchObject([{text: 'hello'}]);
    expect(await sendSlackMessage(client, 'C1', 'hi')).toMatchObject({ts: '2.0'});
    expect(await updateSlackMessage(client, 'C1', '2.0', 'edited')).toMatchObject({channel: 'C1'});
    expect(await addSlackReaction(client, 'C1', '2.0', 'thumbsup')).toMatchObject({reaction: 'thumbsup'});

    expect(calls[0]?.url).toContain('conversations.list');
    expect(calls[2]?.headers as Record<string, string>).toMatchObject({authorization: 'Bearer xoxb-secret'});
    expect(JSON.parse(calls[2]?.body ?? '{}')).toMatchObject({channel: 'C1', text: 'hi'});
  });

  it('handles ok:false responses and redacts network errors', async () => {
    const apiClient = new SlackClient({
      env: {SLACK_BOT_TOKEN: 'xoxb-secret'},
      fetchImpl: vi.fn(() => Promise.resolve(jsonResponse({error: 'not_in_channel', ok: false}))),
    });
    await expect(apiClient.call('chat.postMessage')).rejects.toThrow('not_in_channel');

    const networkClient = new SlackClient({
      env: {SLACK_BOT_TOKEN: 'xoxb-secret'},
      fetchImpl: vi.fn(() => Promise.reject(new Error('failed xoxb-secret'))),
    });
    await expect(networkClient.call('auth.test')).rejects.toThrow('[REDACTED]');
    await expect(networkClient.call('auth.test')).rejects.not.toThrow('xoxb-secret');
  });
});
