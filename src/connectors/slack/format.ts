import type {SlackChannel, SlackMessage} from './types.js';

export const formatSlackChannel = (channel: SlackChannel): string => [
  `#${channel.name} (${channel.id})`,
  channel.isPrivate ? 'Visibility: private' : 'Visibility: public',
  channel.numMembers !== undefined ? `Members: ${channel.numMembers}` : null,
  channel.topic ? `Topic: ${channel.topic}` : null,
  channel.purpose ? `Purpose: ${channel.purpose}` : null,
].filter((line): line is string => line !== null).join('\n');

export const formatSlackChannelList = (channels: SlackChannel[]): string => {
  if (channels.length === 0) {
    return 'No Slack channels found.';
  }
  return channels
    .map((channel) =>
      `#${channel.name} | ${channel.id} | members=${channel.numMembers ?? '?'}${channel.isPrivate ? ' | private' : ''}`,
    )
    .join('\n');
};

export const formatSlackMessage = (message: SlackMessage): string => {
  const author = message.user?.name ?? message.user?.id ?? 'unknown';
  return [
    `[${message.ts}] ${author}${message.threadTs ? ` (thread ${message.threadTs})` : ''}`,
    message.text || '(empty)',
  ].join('\n');
};

export const formatSlackMessageList = (messages: SlackMessage[]): string => {
  if (messages.length === 0) {
    return 'No Slack messages found.';
  }
  return messages.map(formatSlackMessage).join('\n---\n');
};
