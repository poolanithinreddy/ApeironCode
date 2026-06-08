import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import {buildSystemPrompt} from '../../src/agent/prompts.js';
import {buildProviderPromptHints} from '../../src/providers/promptHints.js';

describe('buildSystemPrompt', () => {
  it('includes provider-specific guidance for local prompt-driven tool models', () => {
    const providerHints = buildProviderPromptHints({
      capabilities: {
        contextWindow: 32_000,
        jsonMode: false,
        local: true,
        nativeToolCalling: false,
        streaming: true,
        vision: false,
      },
      model: 'qwen2.5-coder:7b',
      providerName: 'ollama',
    });

    const prompt = buildSystemPrompt({
      globalMemory: null,
      mode: 'feature',
      projectContext: 'Project summary',
      projectMemory: null,
      providerPromptHints: providerHints,
      tools: [
        {
          description: 'Read a file',
          inputSchema: z.object({path: z.string()}),
          name: 'read_file',
          requiresApproval: false,
          riskLevel: 'low',
          run: () => Promise.resolve({ok: true, output: '', summary: ''}),
        },
      ],
      workflow: null,
    });

    expect(prompt).toContain('Active model profile: ollama/qwen2.5-coder:7b');
    expect(prompt).toContain('provider-native tool calling interface');
    expect(prompt).toContain('local or smaller-context model');
  });

  it('labels relevant memory as stale-checkable local context', () => {
    const prompt = buildSystemPrompt({
      mode: 'feature',
      projectContext: 'Project summary',
      relevantMemory: '- [project] decision: Agent memory - use loadRelevantMemory()',
      tools: [],
      workflow: null,
    });

    expect(prompt).toContain('Relevant Memory (local/offline; may be stale');
    expect(prompt).toContain('verify against current files');
    expect(prompt).not.toContain('score=');
  });
});
