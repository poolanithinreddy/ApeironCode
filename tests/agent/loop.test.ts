import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import {runAgentLoop} from '../../src/agent/loop.js';
import {EventBus} from '../../src/core/events/bus.js';
import {ToolRegistry} from '../../src/tools/registry.js';
import {defineTool, type ToolExecutionContext} from '../../src/tools/types.js';
import type {ModelProvider, ProviderChatOptions, ProviderMessage, ProviderStreamChunk} from '../../src/providers/types.js';

class SequenceProvider implements ModelProvider {
  readonly displayName = 'Sequence';
  readonly name = 'sequence';
  readonly supportsStreaming = true;
  readonly supportsToolCalling = false;
  readonly nativeToolFormat = 'anthropic' as const;
  readonly calls: ProviderMessage[][] = [];

  constructor(private readonly responses: string[]) {}

  listModels(): Promise<string[]> {
    return Promise.resolve(['sequence']);
  }

  async *stream(options: ProviderChatOptions): AsyncGenerator<ProviderStreamChunk> {
    await Promise.resolve();
    this.calls.push(options.messages);
    const message = this.responses.shift() ?? 'done';

    // Parse and emit XML tool directives as tool_use chunks
    const toolCallRegex = /<opencode_tool_call>([\s\S]*?)<\/opencode_tool_call>/g;
    let match: RegExpExecArray | null;
    const matches = [];

    // Collect all matches first
    while ((match = toolCallRegex.exec(message)) !== null) {
      if (match[1]) {
        matches.push({match: match[0], content: match[1], index: match.index});
      }
    }

    // If we have tool calls, emit them
    if (matches.length > 0) {
      let currentIndex = 0;
      for (const item of matches) {
        // Emit text before this tool call
        const beforeText = message.slice(currentIndex, item.index);
        if (beforeText.trim()) {
          for (const token of beforeText.trim().split(/(\s+)/)) {
            if (token) {
              yield {type: 'token', token};
            }
          }
        }

        // Parse and emit tool call
        let toolName = 'unknown';
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const toolCall = JSON.parse(item.content);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
          toolName = (typeof toolCall.toolName === 'string' ? toolCall.toolName : 'unknown') || 'unknown';
        } catch {
          // Invalid JSON, extract toolName from raw content if possible
          const nameMatch = item.content.match(/"toolName"\s*:\s*"([^"]+)"/);
          if (nameMatch && nameMatch[1]) {
            toolName = nameMatch[1];
          }
        }

        const toolUseId = `tool_${Date.now()}_${Math.random()}`;
        yield {
          type: 'tool_use_start',
          toolUseId,
          toolName,
        };
        yield {
          type: 'tool_use_delta',
          toolUseId,
          toolInputDelta: item.content,
        };
        yield {
          type: 'tool_use_end',
          toolUseId,
        };

        currentIndex = item.index + item.match.length;
      }

      // Emit remaining text after all tool calls
      const remainingText = message.slice(currentIndex);
      if (remainingText.trim()) {
        for (const token of remainingText.trim().split(/(\s+)/)) {
          if (token) {
            yield {type: 'token', token};
          }
        }
      }
    } else {
      // No tool calls, emit text normally
      for (const token of message.split(/(\s+)/)) {
        if (token) {
          yield {type: 'token', token};
        }
      }
    }

    yield {
      type: 'done',
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
    };
  }
}

const createToolContext = (maxIterations?: number): ToolExecutionContext => ({
  approvalManager: {} as never,
  config: maxIterations === undefined ? {} as never : {maxIterations} as never,
  cwd: process.cwd(),
});

class NativeToolProvider implements ModelProvider {
  readonly displayName = 'Native';
  readonly name = 'native';
  readonly supportsStreaming = true;
  readonly supportsToolCalling = true;
  readonly nativeToolFormat = 'anthropic' as const;
  readonly calls: ProviderMessage[][] = [];

  constructor(private readonly responses: ProviderStreamChunk[][]) {}

  listModels(): Promise<string[]> {
    return Promise.resolve(['native']);
  }

  async *stream(options: ProviderChatOptions): AsyncGenerator<ProviderStreamChunk> {
    await Promise.resolve();
    this.calls.push(options.messages);
    const chunks = this.responses.shift() ?? [{type: 'token', token: 'done'}];
    for (const chunk of chunks) {
      yield chunk;
    }
    yield {
      type: 'done',
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
    };
  }
}

const nativeToolUse = (name: string, input: Record<string, unknown>, id: string): ProviderStreamChunk[] => [
  {type: 'tool_use_start', toolName: name, toolUseId: id},
  {type: 'tool_use_delta', toolInputDelta: JSON.stringify(input), toolUseId: id},
  {type: 'tool_use_end', toolUseId: id},
];

const createRegistry = (): ToolRegistry => new ToolRegistry([
  defineTool({
    description: 'No operation',
    inputSchema: z.object({value: z.string().optional()}),
    name: 'noop',
    requiresApproval: false,
    riskLevel: 'low',
    run: () => Promise.resolve({ok: true, output: '', summary: ''}),
  }),
  defineTool({
    description: 'Read file',
    inputSchema: z.object({path: z.string()}),
    name: 'read_file',
    requiresApproval: false,
    riskLevel: 'low',
    run: () => Promise.resolve({ok: true, output: '', summary: ''}),
  }),
  defineTool({
    description: 'Edit file',
    inputSchema: z.object({path: z.string()}),
    name: 'edit_file',
    requiresApproval: false,
    riskLevel: 'low',
    run: (input) => Promise.resolve({
      ok: true,
      output: '',
      summary: '',
      metadata: {filePath: (input as {path: string}).path},
    }),
  }),
  defineTool({
    description: 'Alpha tool',
    inputSchema: z.object({value: z.string()}),
    name: 'alpha',
    requiresApproval: false,
    riskLevel: 'low',
    run: (input) => Promise.resolve({
      ok: true,
      output: `alpha:${(input as {value: string}).value}`,
      summary: 'alpha ok',
    }),
  }),
]);

describe('runAgentLoop', () => {
  it('executes multiple tool-call blocks from a single model response', async () => {
    const provider = new SequenceProvider([
      [
        '<opencode_tool_call>{"toolName":"alpha","input":{"value":"one"}}</opencode_tool_call>',
        '<opencode_tool_call>{"toolName":"beta","input":{"value":"two"}}</opencode_tool_call>',
      ].join('\n'),
      'All done.',
    ]);
    const registry = new ToolRegistry([
      defineTool({
        description: 'Alpha tool',
        inputSchema: z.object({value: z.string()}),
        name: 'alpha',
        requiresApproval: false,
        riskLevel: 'low',
        run: (input) => Promise.resolve({
          ok: true,
          output: `alpha:${(input as {value: string}).value}`,
          summary: 'alpha ok',
        }),
      }),
      defineTool({
        description: 'Beta tool',
        inputSchema: z.object({value: z.string()}),
        name: 'beta',
        requiresApproval: false,
        riskLevel: 'low',
        run: (input) => Promise.resolve({
          ok: true,
          output: `beta:${(input as {value: string}).value}`,
          summary: 'beta ok',
        }),
      }),
    ]);

    const result = await runAgentLoop({
      initialMessages: [],
      model: 'sequence',
      provider,
      systemPrompt: 'Test prompt',
      toolContext: createToolContext(),
      toolRegistry: registry,
      userPrompt: 'Use alpha and beta',
    });

    expect(result.finalMessage.content).toBe('All done.');
    expect(result.toolCalls.map((toolCall) => toolCall.toolName)).toEqual(['alpha', 'beta']);
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1]?.some((message) => message.content.includes('Tool result for alpha:'))).toBe(true);
    expect(provider.calls[1]?.some((message) => message.content.includes('Tool result for beta:'))).toBe(true);
  });

  it('requests a retry when a model emits malformed tool JSON', async () => {
    const provider = new SequenceProvider([
      '<opencode_tool_call>{"toolName":"alpha","input":{"value":"broken"}</opencode_tool_call>',
      '<opencode_tool_call>{"toolName":"alpha","input":{"value":"fixed"}}</opencode_tool_call>',
      'Recovered.',
    ]);
    const registry = new ToolRegistry([
      defineTool({
        description: 'Alpha tool',
        inputSchema: z.object({value: z.string()}),
        name: 'alpha',
        requiresApproval: false,
        riskLevel: 'low',
        run: (input) => Promise.resolve({
          ok: true,
          output: `alpha:${(input as {value: string}).value}`,
          summary: 'alpha ok',
        }),
      }),
    ]);

    const result = await runAgentLoop({
      initialMessages: [],
      model: 'sequence',
      provider,
      systemPrompt: 'Test prompt',
      toolContext: createToolContext(),
      toolRegistry: registry,
      userPrompt: 'Recover from malformed tool JSON',
    });

    // Phase 16B: completion gate feedback may be appended for unrecovered failures.
    expect(result.finalMessage.content.startsWith('Recovered.')).toBe(true);
    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0]?.status).toBe('error');
    expect(result.toolCalls[1]?.status).toBe('success');
    expect(result.messages.some((message) => message.content.includes('Tool call format error'))).toBe(true);
    expect(provider.calls).toHaveLength(3);
  });

  it('uses a default capped budget of 40 when advisor recommends more', async () => {
    const provider = new NativeToolProvider(
      Array.from({length: 41}, (_, index) => nativeToolUse('read_file', {path: `src/${index}.ts`}, `read-${index}`)),
    );
    const eventBus = new EventBus();

    const result = await runAgentLoop({
      eventBus,
      initialMessages: [],
      mode: 'feature',
      model: 'native',
      provider,
      systemPrompt: 'Test prompt',
      toolContext: createToolContext(),
      toolRegistry: createRegistry(),
      userPrompt: 'rewrite architecture change across multiple files',
    });

    expect(result.finalMessage.content).toContain('Reached maximum iterations (40)');
    expect(result.toolCalls).toHaveLength(40);
    expect(eventBus.snapshot().filter((event) => event.type === 'loop.progress')).toHaveLength(40);
  });

  it('respects explicit maxIterations', async () => {
    const provider = new NativeToolProvider(
      Array.from({length: 3}, (_, index) => nativeToolUse('read_file', {path: `src/${index}.ts`}, `read-${index}`)),
    );

    const result = await runAgentLoop({
      initialMessages: [],
      maxIterations: 2,
      model: 'native',
      provider,
      systemPrompt: 'Test prompt',
      toolContext: createToolContext(),
      toolRegistry: createRegistry(),
      userPrompt: 'read files',
    });

    expect(result.finalMessage.content).toContain('Reached maximum iterations (2)');
    expect(result.toolCalls).toHaveLength(2);
  });

  it('respects configured maxIterations as the dynamic budget cap', async () => {
    const provider = new NativeToolProvider(
      Array.from({length: 8}, (_, index) => nativeToolUse('read_file', {path: `src/${index}.ts`}, `read-${index}`)),
    );

    const result = await runAgentLoop({
      initialMessages: [],
      mode: 'feature',
      model: 'native',
      provider,
      systemPrompt: 'Test prompt',
      toolContext: createToolContext(5),
      toolRegistry: createRegistry(),
      userPrompt: 'rewrite architecture change across multiple files',
    });

    expect(result.finalMessage.content).toContain('Reached maximum iterations (5)');
    expect(result.toolCalls).toHaveLength(5);
  });

  it('emits stalled progress and exits gracefully after three no-progress iterations', async () => {
    const provider = new NativeToolProvider([
      nativeToolUse('noop', {value: 'same'}, 'noop-1'),
      nativeToolUse('noop', {value: 'same'}, 'noop-2'),
      nativeToolUse('noop', {value: 'same'}, 'noop-3'),
      [{type: 'token', token: 'should not reach'}],
    ]);
    const eventBus = new EventBus();

    const result = await runAgentLoop({
      eventBus,
      initialMessages: [],
      maxIterations: 10,
      model: 'native',
      provider,
      systemPrompt: 'Test prompt',
      toolContext: createToolContext(),
      toolRegistry: createRegistry(),
      userPrompt: 'keep trying noop',
    });

    expect(result.finalMessage.content).toContain('stopped making meaningful progress');
    expect(result.finalMessage.content).toContain('A clearer target file');
    expect(eventBus.snapshot().some((event) => event.type === 'loop.stalled')).toBe(true);
  });

  it('does not stall when new file reads or edits occur', async () => {
    const eventBus = new EventBus();
    const provider = new NativeToolProvider([
      nativeToolUse('read_file', {path: 'src/a.ts'}, 'read-a'),
      nativeToolUse('read_file', {path: 'src/b.ts'}, 'read-b'),
      nativeToolUse('edit_file', {path: 'src/c.ts'}, 'edit-c'),
      [{type: 'token', token: 'done'}],
    ]);

    const result = await runAgentLoop({
      eventBus,
      initialMessages: [],
      maxIterations: 10,
      model: 'native',
      provider,
      systemPrompt: 'Test prompt',
      toolContext: createToolContext(),
      toolRegistry: createRegistry(),
      userPrompt: 'read and edit files',
    });

    // Phase 16B: completion gate feedback may be appended for source-edit-without-tests.
    expect(result.finalMessage.content.startsWith('done')).toBe(true);
    expect(eventBus.snapshot().some((event) => event.type === 'loop.stalled')).toBe(false);
  });

  it('preserves native tool calling without XML directives', async () => {
    const provider = new NativeToolProvider([
      nativeToolUse('alpha', {value: 'native'}, 'alpha-1'),
      [{type: 'token', token: 'Native done.'}],
    ]);

    const result = await runAgentLoop({
      initialMessages: [],
      model: 'native',
      provider,
      systemPrompt: 'Test prompt',
      toolContext: createToolContext(),
      toolRegistry: createRegistry(),
      userPrompt: 'use native alpha',
    });

    expect(result.finalMessage.content).toBe('Native done.');
    expect(result.toolCalls.map((toolCall) => toolCall.toolName)).toEqual(['alpha']);
  });
});
