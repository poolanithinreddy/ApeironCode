import type {SlackClient} from './client.js';
import type {SlackChannel, SlackListChannelsOptions} from './types.js';

interface RawSlackChannel {
  id: string;
  is_archived?: boolean;
  is_member?: boolean;
  is_private?: boolean;
  name: string;
  num_members?: number;
  purpose?: {value?: string};
  topic?: {value?: string};
}

const mapChannel = (channel: RawSlackChannel): SlackChannel => ({
  id: channel.id,
  isArchived: channel.is_archived,
  isMember: channel.is_member,
  isPrivate: channel.is_private,
  name: channel.name,
  numMembers: channel.num_members,
  purpose: channel.purpose?.value,
  topic: channel.topic?.value,
});

export const listSlackChannels = async (
  client: SlackClient,
  options: SlackListChannelsOptions = {},
): Promise<SlackChannel[]> => {
  const data = await client.call<{channels?: RawSlackChannel[]; ok: boolean}>('conversations.list', {
    method: 'GET',
    query: {
      exclude_archived: options.excludeArchived ?? true,
      limit: options.limit ?? 100,
      types: (options.types ?? ['public_channel']).join(','),
    },
  });
  return (data.channels ?? []).map(mapChannel);
};
