import {highlight} from 'cli-highlight';
import {Box, Text} from 'ink';
import React from 'react';

import type {ChatMessage} from '../agent/types.js';
import {StreamingCursor} from './StreamingCursor.js';

interface MessageItemProps {
  message: ChatMessage;
  streamingContent?: string;
  isStreaming?: boolean;
}

type ContentSegment =
  | {type: 'text'; value: string}
  | {type: 'code'; value: string; language: string | undefined};

const parseSegments = (content: string): ContentSegment[] => {
  const segments: ContentSegment[] = [];
  const pattern = /```(\w+)?\n([\s\S]*?)```/gu;
  let lastIndex = 0;

  for (const match of content.matchAll(pattern)) {
    const fullMatch = match[0];
    const language = match[1];
    const code = match[2] ?? '';
    const index = match.index ?? 0;

    if (index > lastIndex) {
      segments.push({
        type: 'text',
        value: content.slice(lastIndex, index),
      });
    }

    segments.push({
      language,
      type: 'code',
      value: code.trimEnd(),
    });
    lastIndex = index + fullMatch.length;
  }

  if (lastIndex < content.length) {
    segments.push({
      type: 'text',
      value: content.slice(lastIndex),
    });
  }

  return segments;
};

const roleColor = (role: ChatMessage['role']): 'cyan' | 'green' | 'yellow' | 'magenta' => {
  if (role === 'assistant') {
    return 'green';
  }

  if (role === 'tool') {
    return 'yellow';
  }

  if (role === 'system') {
    return 'magenta';
  }

  return 'cyan';
};

export const MessageItem = ({message, streamingContent, isStreaming}: MessageItemProps) => {
  const displayContent = streamingContent !== undefined ? streamingContent : message.content;
  const segments = parseSegments(displayContent);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={roleColor(message.role)}>{message.role.toUpperCase()}</Text>
      {segments.map((segment, index) => {
        if (segment.type === 'code') {
          return (
            <Box key={`${message.id}-${index}`} borderStyle="round" borderColor="gray" paddingX={1}>
              <Text>
                {highlight(segment.value, {
                  ignoreIllegals: true,
                  language: segment.language,
                })}
              </Text>
            </Box>
          );
        }

        return (
          <Text key={`${message.id}-${index}`}>
            {segment.value.trimEnd()}
          </Text>
        );
      })}
      {isStreaming && <StreamingCursor isVisible={isStreaming} />}
    </Box>
  );
};