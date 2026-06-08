import {describe, expect, it} from 'vitest';

import {
  createTokenLedger,
  formatTokenLedger,
  recordCompletionTokens,
  recordContextTokens,
  recordConversationTokens,
  recordMemoryTokens,
  recordPromptTokens,
  recordToolResultTokens,
  recordToolSchemaTokens,
  summarizeTokenLedger,
} from '../../src/tokens/accounting.js';

describe('token accounting', () => {
  it('tracks category totals and savings', () => {
    const ledger = createTokenLedger();
    recordPromptTokens(ledger, 'system prompt');
    ledger.categories.user = 5;
    recordConversationTokens(ledger, 'assistant history');
    recordContextTokens(ledger, 'selected context', 10);
    recordMemoryTokens(ledger, 'memory block', 6);
    recordToolSchemaTokens(ledger, 20, 8);
    recordToolResultTokens(ledger, 14, 5);
    recordCompletionTokens(ledger, 11);

    const summary = summarizeTokenLedger(ledger);
    expect(summary.totalEstimatedInput).toBeGreaterThan(0);
    expect(summary.totalEstimatedOutput).toBe(11);
    expect(summary.savings.context).toBe(10);
    expect(summary.savings.schema).toBe(8);
    expect(summary.breakdown.tools).toBe(20);
    expect(summary.breakdown.output).toBe(11);
  });

  it('formats without leaking secrets', () => {
    const ledger = createTokenLedger();
    recordPromptTokens(ledger, 'Bearer abcdefghijklmnopqrstuvwxyz');
    const formatted = formatTokenLedger(ledger);
    expect(formatted).toContain('input=');
    expect(formatted).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });
});
