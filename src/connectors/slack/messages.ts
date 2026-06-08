import type {SlackClient} from './client.js';
import type {
  SlackHistoryOptions,
  SlackMessage,
  SlackPostedMessage,
  SlackReactionResult,
  SlackSendMessageOptions,
} from './types.js';

interface RawSlackMessage {
  text?: string;
  thread_ts?: string;
  ts: string;
  user?: string;
  username?: string;
}

const mapMessage = (message: RawSlackMessage, channelId?: string): SlackMessage => ({
  channel: channelId,
  text: message.text ?? '',
  threadTs: message.thread_ts,
  ts: message.ts,
  user: message.user || message.username
    ? {id: message.user, name: message.username}
    : null,
});

export const getSlackChannelHistory = async (
  client: SlackClient,
  channelId: string,
  options: SlackHistoryOptions = {},
): Promise<SlackMessage[]> => {
  const data = await client.call<{messages?: RawSlackMessage[]; ok: boolean}>('conversations.history', {
    method: 'GET',
    query: {
      channel: channelId,
      inclusive: options.inclusive,
      latest: options.latest,
      limit: options.limit ?? 50,
      oldest: options.oldest,
    },
  });
  return (data.messages ?? []).map((message) => mapMessage(message, channelId));
};

export const sendSlackMessage = async (
  client: SlackClient,
  channelId: string,
  text: string,
  options: SlackSendMessageOptions = {},
): Promise<SlackPostedMessage> => {
  const body: Record<string, unknown> = {channel: channelId, text};
  if (options.threadTs) {
    body.thread_ts = options.threadTs;
  }
  if (options.unfurlLinks !== undefined) {
    body.unfurl_links = options.unfurlLinks;
  }
  const data = await client.call<{channel?: string; ok: boolean; ts?: string}>('chat.postMessage', {
    body,
    method: 'POST',
  });
  return {channel: data.channel ?? channelId, ts: data.ts ?? ''};
};

export const updateSlackMessage = async (
  client: SlackClient,
  channelId: string,
  ts: string,
  text: string,
): Promise<SlackPostedMessage> => {
  const data = await client.call<{channel?: string; ok: boolean; ts?: string}>('chat.update', {
    body: {channel: channelId, text, ts},
    method: 'POST',
  });
  return {channel: data.channel ?? channelId, ts: data.ts ?? ts};
};

export const addSlackReaction = async (
  client: SlackClient,
  channelId: string,
  ts: string,
  reaction: string,
): Promise<SlackReactionResult> => {
  await client.call<{ok: boolean}>('reactions.add', {
    body: {channel: channelId, name: reaction, timestamp: ts},
    method: 'POST',
  });
  return {channel: channelId, reaction, ts};
};
