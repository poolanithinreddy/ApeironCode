import {describe, expect, it} from 'vitest';

import {formatEffectiveModeLabel, resolveEffectiveMode} from '../../src/agent/effectiveMode.js';
import {buildStandardizedFinalSummary} from '../../src/agent/finalSummary.js';

describe('effective mode resolution', () => {
  it('infers explain mode from a repo explanation prompt', () => {
    const resolution = resolveEffectiveMode({
      prompt: 'Explain this repo and its architecture',
      sessionMode: 'chat',
    });

    expect(resolution.requestedMode).toBe('chat');
    expect(resolution.effectiveMode).toBe('explain');
    expect(resolution.reason).toBe('inferred-from-prompt');
    expect(formatEffectiveModeLabel(resolution)).toBe('explain (inferred from prompt)');
  });

  it('infers test-fix mode from failing test prompts', () => {
    const resolution = resolveEffectiveMode({
      prompt: 'Fix failing tests in the workflow suite',
      sessionMode: 'chat',
    });

    expect(resolution.effectiveMode).toBe('test-fix');
    expect(resolution.reason).toBe('inferred-from-prompt');
  });

  it('keeps explicit chat mode when prompt inference is disabled', () => {
    const resolution = resolveEffectiveMode({
      allowPromptInference: false,
      explicitMode: 'chat',
      prompt: 'Explain this repo',
      sessionMode: 'chat',
    });

    expect(resolution.requestedMode).toBe('chat');
    expect(resolution.effectiveMode).toBe('chat');
    expect(resolution.reason).toBe('explicit');
  });

  it('uses the same effective mode label in standardized summaries', () => {
    const resolution = resolveEffectiveMode({
      prompt: 'Explain this repo',
      sessionMode: 'chat',
    });
    const modeLabel = formatEffectiveModeLabel(resolution);
    const summary = buildStandardizedFinalSummary({
      baseSummary: 'Summary complete.',
      goal: 'Explain this repo',
      memorySuggestions: [],
      mode: resolution.effectiveMode,
      modeLabel,
      toolCalls: [],
    });

    expect(summary).toContain(`- Mode: ${modeLabel}`);
  });
});