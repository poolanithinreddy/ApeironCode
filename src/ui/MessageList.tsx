import {Box, Text} from 'ink';
import React from 'react';

import type {ChatMessage, ToolCallRecord} from '../agent/types.js';
import type {StreamingMessageState} from './streamingState.js';
import {MessageItem} from './MessageItem.js';
import {ToolCard} from './ToolCard.js';

interface MessageListProps {
  messages: ChatMessage[];
  toolCalls: ToolCallRecord[];
  streamingMessages?: Map<string, StreamingMessageState>;
  verbose?: boolean;
}

const WINDOW_SIZE = 10;
const TOOL_WINDOW_SIZE = 4;

export const MessageList = ({messages, toolCalls, streamingMessages, verbose = false}: MessageListProps) => {
  // Merge streaming and completed messages
  const allMessages: Array<{message: ChatMessage; streaming?: StreamingMessageState}> = [];

  for (const message of messages) {
    allMessages.push({message});
  }

  // Add streaming messages that don't have a completed message yet
  if (streamingMessages) {
    for (const [messageId, streamingState] of streamingMessages) {
      if (!messages.some((m) => m.id === messageId)) {
        allMessages.push({
          message: {
            content: streamingState.content,
            createdAt: new Date(streamingState.startedAt).toISOString(),
            id: messageId,
            role: 'assistant',
          },
          streaming: streamingState,
        });
      }
    }
  }

  const totalMessages = allMessages.length;
  const messageWindowStart = Math.max(0, totalMessages - WINDOW_SIZE);
  const visibleMessages = allMessages.slice(messageWindowStart);

  const hasMoreBefore = messageWindowStart > 0;
  const totalToolCalls = toolCalls.length;
  const visibleToolCalls = totalToolCalls > 0 ? toolCalls.slice(Math.max(0, totalToolCalls - TOOL_WINDOW_SIZE)) : [];

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={0}>
      {hasMoreBefore && (
        <Text dimColor italic>{messageWindowStart} earlier message{messageWindowStart === 1 ? '' : 's'} hidden. Use /show-more to reveal.</Text>
      )}
      {visibleMessages.length === 0 && totalMessages === 0 ? (
        <Text dimColor>Ask a coding question, request a review, or run a slash command.</Text>
      ) : null}
      {visibleMessages.map(({message, streaming}) => (
        <MessageItem
          key={message.id}
          message={message}
          streamingContent={streaming?.content}
          isStreaming={streaming?.isStreaming}
        />
      ))}
      {visibleToolCalls.length > 0 && verbose ? <Text color="yellow">Tool Activity</Text> : null}
      {visibleToolCalls.map((toolCall) => (
        <ToolCard
          key={toolCall.id}
          toolCall={toolCall}
          durationMs={toolCall.durationMs}
          permissionDecision={toolCall.permissionDecision}
          verbose={verbose}
        />
      ))}
    </Box>
  );
};