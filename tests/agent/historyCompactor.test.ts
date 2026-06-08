import {describe, expect, it} from 'vitest';

import {
  compactConversationHistory,
  formatHistoryCompactionReport,
  preserveRecentTurns,
  preserveUserRequirements,
  summarizeToolMessageForHistory,
} from '../../src/agent/historyCompactor.js';
import type {ChatMessage} from '../../src/agent/types.js';

const message = (id: string, role: ChatMessage['role'], content: string): ChatMessage => ({
  content,
  createdAt: new Date(0).toISOString(),
  id,
  role,
});

describe('history compactor', () => {
  it('preserves recent turns and user requirements', () => {
    const messages = [
      message('1', 'user', 'Do not change package.json'),
      message('2', 'assistant', 'status update'),
      message('3', 'tool', 'line\nline\nline'),
      message('4', 'assistant', 'another status'),
      message('5', 'user', 'latest instruction exactly'),
    ];
    const result = compactConversationHistory(messages, {maxTokens: 20, preserveRecentTurns: 2});
    expect(preserveRecentTurns(messages, 2)).toHaveLength(2);
    expect(preserveUserRequirements(messages).map((entry) => entry.id)).toContain('1');
    expect(result.messages.some((entry) => entry.content.includes('latest instruction exactly'))).toBe(true);
    expect(result.report.compactedTokens).toBeLessThanOrEqual(result.report.originalTokens);
    expect(formatHistoryCompactionReport(result.report)).toContain('history:');
  });

  it('summarizes old tool output and redacts secrets', () => {
    const summarized = summarizeToolMessageForHistory(
      message('tool', 'tool', 'noise\nFAIL test\nAssertionError: nope\nBearer secret-token-value'),
    );
    expect(summarized.content).toContain('FAIL test');
    expect(summarized.content).not.toContain('secret-token-value');
  });
});
