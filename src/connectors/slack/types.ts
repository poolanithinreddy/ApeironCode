export interface SlackChannel {
  id: string;
  isArchived?: boolean;
  isMember?: boolean;
  isPrivate?: boolean;
  name: string;
  numMembers?: number;
  purpose?: string;
  topic?: string;
}

export interface SlackUserRef {
  id?: string;
  name?: string;
}

export interface SlackMessage {
  channel?: string;
  text: string;
  threadTs?: string;
  ts: string;
  user?: SlackUserRef | null;
}

export interface SlackListChannelsOptions {
  excludeArchived?: boolean;
  limit?: number;
  types?: Array<'public_channel' | 'private_channel' | 'mpim' | 'im'>;
}

export interface SlackHistoryOptions {
  inclusive?: boolean;
  latest?: string;
  limit?: number;
  oldest?: string;
}

export interface SlackSendMessageOptions {
  threadTs?: string;
  unfurlLinks?: boolean;
}

export interface SlackPostedMessage {
  channel: string;
  ts: string;
}

export interface SlackReactionResult {
  channel: string;
  reaction: string;
  ts: string;
}
