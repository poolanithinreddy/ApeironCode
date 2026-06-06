import type {ToolCallRecord} from '../agent/types.js';
import type {ModelProvider, ProviderChatOptions, ProviderStreamChunk} from '../providers/types.js';

import type {EvalAgentAdapter, EvalAgentRunResult} from './types.js';

export type EvalStreamScript = Array<ProviderStreamChunk | string>;

const now = (): string => new Date().toISOString();

export const createToolCallRecord = (
  toolName: string,
  input: Record<string, unknown> = {},
  status: ToolCallRecord['status'] = 'success',
): ToolCallRecord => ({
  createdAt: now(),
  id: `eval_${toolName}_${Math.random().toString(36).slice(2)}`,
  input,
  result: {
    ok: status === 'success',
    output: status === 'success' ? 'eval tool result' : '',
    summary: status === 'success' ? `${toolName} succeeded` : `${toolName} failed`,
  },
  status,
  toolName,
});

export const tokenChunk = (token: string): ProviderStreamChunk => ({token, type: 'token'});
export const doneChunk = (): ProviderStreamChunk => ({type: 'done'});

export const toolCallChunks = (
  toolName: string,
  input: Record<string, unknown> = {},
  id = `tool_${toolName}`,
): ProviderStreamChunk[] => [
  {toolName, toolUseId: id, type: 'tool_use_start'},
  {toolInputDelta: JSON.stringify(input), toolUseId: id, type: 'tool_use_delta'},
  {toolUseId: id, type: 'tool_use_end'},
];

export const readFile = (path: string): ProviderStreamChunk[] => toolCallChunks('read_file', {path});
export const writeFile = (path: string, content: string): ProviderStreamChunk[] =>
  toolCallChunks('write_file', {content, path});
export const editFile = (path: string, search: string, replace: string): ProviderStreamChunk[] =>
  toolCallChunks('edit_file', {path, replace, search});
export const patchFile = (path: string, patch: string): ProviderStreamChunk[] =>
  toolCallChunks('patch_file', {patch, path});
export const runCommand = (command: string, args: string[] = []): ProviderStreamChunk[] =>
  toolCallChunks('run_command', {args, command});
export const testRunner = (): ProviderStreamChunk[] => toolCallChunks('test_runner', {});

export class EvalMockProvider implements ModelProvider {
  readonly displayName = 'Eval Mock Provider';
  readonly name = 'eval-mock';
  readonly nativeToolFormat = 'anthropic' as const;
  readonly supportsStreaming = true;
  readonly supportsToolCalling = true;

  constructor(private readonly script: EvalStreamScript = ['Eval completed.', doneChunk()]) {}

  listModels(): Promise<string[]> {
    return Promise.resolve(['eval-mock']);
  }

  async *stream(options: ProviderChatOptions): AsyncGenerator<ProviderStreamChunk> {
    void options;
    await Promise.resolve();
    for (const chunk of this.script) {
      yield typeof chunk === 'string' ? tokenChunk(chunk) : chunk;
    }
  }
}

export const createDeterministicEvalAgent = (): EvalAgentAdapter => ({
  async runEval(evalCase, workspace): Promise<EvalAgentRunResult> {
    const toolCalls = (evalCase.expectedTools ?? []).map((toolName) => createToolCallRecord(toolName));

    if (evalCase.tags?.includes('writes-fixture')) {
      await workspace.writeFile('generated.txt', 'created by eval harness\n');
    }
    if (evalCase.tags?.includes('fixes-todo')) {
      await workspace.writeFile('src/math.ts', 'export const add = (a: number, b: number) => a + b;\n');
    }
    if (evalCase.tags?.includes('updates-config')) {
      await workspace.writeFile('config.json', '{\n  "strict": true\n}\n');
    }

    return {
      compressionRatio: evalCase.tags?.includes('compressed') ? 0.35 : 1,
      contextText: evalCase.tags?.includes('large-context') ? 'context '.repeat(400) : '',
      filesChanged: [],
      finalOutput: 'Eval completed.',
      iterations: Math.min(evalCase.maxIterations ?? 2, 2),
      memoryText: evalCase.tags?.includes('memory') ? 'Decision: use compact memory.' : '',
      tokenUsage: {inputTokens: 12, outputTokens: 8, totalTokens: 20},
      toolSchemaText: (evalCase.expectedTools ?? []).join('\n'),
      toolCalls,
    };
  },
});
