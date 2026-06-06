import type {ChatMessage} from './types.js';
import {estimateTokens} from '../tokens/estimate.js';
import {redactSecretLikeContent} from '../memory/safety.js';

export interface HistoryCompactionOptions {
  maxTokens?: number;
  preserveRecentTurns?: number;
}

export interface HistoryCompactionReport {
  originalTokens: number;
  compactedTokens: number;
  removedMessages: number;
  summaryMessages: number;
}

const requirementPattern = /\b(do not|never|must|important|require|preserve|keep)\b/iu;
const failurePattern = /\b(fail|failed|error|assert|exception|traceback|expected|received)\b/iu;

export const summarizeToolMessageForHistory = (message: ChatMessage): ChatMessage => {
  const content = redactSecretLikeContent(message.content);
  const lines = content.split(/\r?\n/u).filter(Boolean);
  const selected = lines.filter((line) => failurePattern.test(line)).slice(0, 6);
  const body = selected.length > 0
    ? selected.join('\n')
    : lines.slice(0, 3).join('\n');
  return {
    ...message,
    content: `Summarized tool result:\n${body}`.trim(),
  };
};

export const preserveRecentTurns = (messages: ChatMessage[], n: number): ChatMessage[] =>
  messages.slice(-Math.max(0, n));

export const preserveUserRequirements = (messages: ChatMessage[]): ChatMessage[] =>
  messages.filter((message) => message.role === 'user' && requirementPattern.test(message.content));

export const compactConversationHistory = (
  messages: ChatMessage[],
  options: HistoryCompactionOptions = {},
): {messages: ChatMessage[]; report: HistoryCompactionReport} => {
  const maxTokens = options.maxTokens ?? 2_000;
  const preserveCount = options.preserveRecentTurns ?? 4;
  const originalTokens = estimateTokens(messages.map((message) => message.content).join('\n'));
  if (messages.length <= preserveCount + 2 || originalTokens <= maxTokens) {
    return {
      messages,
      report: {compactedTokens: originalTokens, originalTokens, removedMessages: 0, summaryMessages: 0},
    };
  }

  const recent = preserveRecentTurns(messages, preserveCount);
  const requiredIds = new Set([
    ...recent.map((message) => message.id),
    ...preserveUserRequirements(messages).map((message) => message.id),
    ...messages.slice(-1).map((message) => message.id),
  ]);

  const compacted: ChatMessage[] = [];
  let summaryMessages = 0;
  let removedMessages = 0;

  for (const message of messages) {
    if (requiredIds.has(message.id)) {
      compacted.push({...message, content: redactSecretLikeContent(message.content)});
      continue;
    }
    if (message.role === 'tool' || message.role === 'assistant') {
      compacted.push(message.role === 'tool'
        ? summarizeToolMessageForHistory(message)
        : {...message, content: redactSecretLikeContent(message.content).slice(0, 400)});
      summaryMessages += 1;
    } else {
      removedMessages += 1;
    }
  }

  const deduped = compacted.filter((message, index) => {
    const normalized = message.content.trim().replace(/\s+/gu, ' ').toLowerCase();
    return normalized.length > 0 && compacted.findIndex((candidate) =>
      candidate.role === message.role
      && candidate.content.trim().replace(/\s+/gu, ' ').toLowerCase() === normalized) === index;
  });

  let trimmed = deduped;
  while (estimateTokens(trimmed.map((message) => message.content).join('\n')) > maxTokens && trimmed.length > preserveCount) {
    const removableIndex = trimmed.findIndex((message) => message.role !== 'user');
    if (removableIndex < 0) break;
    trimmed = trimmed.filter((_, index) => index !== removableIndex);
    removedMessages += 1;
  }

  return {
    messages: trimmed,
    report: {
      compactedTokens: estimateTokens(trimmed.map((message) => message.content).join('\n')),
      originalTokens,
      removedMessages,
      summaryMessages,
    },
  };
};

export const formatHistoryCompactionReport = (report: HistoryCompactionReport): string =>
  `history: original=${report.originalTokens}, compacted=${report.compactedTokens}, removed=${report.removedMessages}, summarized=${report.summaryMessages}`;
