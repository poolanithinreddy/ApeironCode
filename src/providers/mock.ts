import type {ModelProvider, ProviderChatOptions, ProviderMessage, ProviderStreamChunk} from './types.js';

interface MockConversationState {
  currentPrompt: string;
  toolCalls: Array<{input: Record<string, unknown>; name: string}>;
  toolResults: Map<string, string>;
}

const getState = (messages: ProviderMessage[]): MockConversationState => {
  let promptIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message?.role === 'user'
      && !message.content.startsWith('Tool result for')
      && !message.content.startsWith('Tool ')
    ) {
      promptIndex = index;
      break;
    }
  }

  const currentPrompt = promptIndex >= 0 ? messages[promptIndex]!.content : '';

  const toolResults = new Map<string, string>();
  const toolCalls: Array<{input: Record<string, unknown>; name: string}> = [];

  for (const message of messages.slice(promptIndex + 1)) {
    if (message.role !== 'user' || !message.content.startsWith('Tool result for')) {
      continue;
    }

    const match = message.content.match(/^Tool result for (.+?):\n\n([\s\S]*)$/u);
    if (!match?.[1] || !match[2]) {
      continue;
    }

    const toolName = match[1];
    const output = match[2];
    toolResults.set(toolName, output);
    toolCalls.push({name: toolName, input: {}});
  }

  return {
    currentPrompt,
    toolCalls,
    toolResults,
  };
};

const extractExplicitPaths = (prompt: string): string[] => {
  const matches = prompt.match(/[A-Za-z0-9_./-]+\.[A-Za-z0-9_-]+/gu) ?? [];
  return Array.from(new Set(matches.filter((match) => !/^\d+(?:\.\d+)+$/u.test(match))));
};

const extractReplaceInstruction = (
  prompt: string,
  explicitPath: string | null,
): {path: string; replace: string; search: string} | null => {
  if (!explicitPath) {
    return null;
  }

  const match = prompt.match(/replace\s+"([^"]+)"\s+with\s+"([^"]+)"/iu);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  return {
    path: explicitPath,
    replace: match[2],
    search: match[1],
  };
};

const extractCommitMessage = (prompt: string): string => {
  const quoted = prompt.match(/message\s+"([^"]+)"/iu);
  if (quoted?.[1]) {
    return quoted[1];
  }

  return 'update changes';
};

const buildExecutionSummary = (state: MockConversationState, prompt: string): string => {
  const lines = ['Execution summary:'];

  if (state.toolCalls.some((call) => call.name === 'read_file')) {
    lines.push('- Read the requested file context.');
  }
  if (state.toolCalls.some((call) => call.name === 'edit_file')) {
    lines.push('- Applied the requested file edit.');
  }
  if (state.toolCalls.some((call) => call.name === 'test_runner')) {
    lines.push('- Ran the project test command.');
  }
  if (state.toolCalls.some((call) => call.name === 'git_diff')) {
    lines.push('- Reviewed the current git diff.');
  }
  if (state.toolCalls.some((call) => call.name === 'run_command')) {
    lines.push('- Prepared the working tree for commit.');
  }
  if (state.toolCalls.some((call) => call.name === 'git_commit')) {
    lines.push(`- Created commit "${extractCommitMessage(prompt)}".`);
  }
  if (state.toolCalls.some((call) => call.name.startsWith('mcp:'))) {
    lines.push(`- Invoked MCP tools: ${state.toolCalls.filter((call) => call.name.startsWith('mcp:')).map((call) => call.name).join(', ')}.`);
  }

  return lines.join('\n');
};

const decideToolCalls = (messages: ProviderMessage[]): Array<{name: string; input: Record<string, unknown>}> => {
  const state = getState(messages);
  const prompt = state.currentPrompt;
  const lowerPrompt = prompt.toLowerCase();
  const explicitPaths = extractExplicitPaths(prompt);
  const readCount = state.toolCalls.filter((call) => call.name === 'read_file').length;
  const nextExplicitPath = explicitPaths[readCount] ?? null;
  const replaceInstruction = extractReplaceInstruction(prompt, explicitPaths[0] ?? null);

  if (/explain this repo|explain this codebase/u.test(lowerPrompt)) {
    if (!state.toolResults.has('package_info')) {
      return [{name: 'package_info', input: {}}];
    }
    if (!state.toolResults.has('project_tree')) {
      return [{name: 'project_tree', input: {depth: 2}}];
    }
    return [];
  }

  if (/review(?: the)?(?: current)?(?: git)? diff|code review|review my changes|review changes/u.test(lowerPrompt)) {
    if (!state.toolResults.has('git_diff')) {
      return [{name: 'git_diff', input: {}}];
    }
    return [];
  }

  if (/\bcommit\b|commit message|git commit/u.test(lowerPrompt)) {
    if (!state.toolResults.has('git_diff')) {
      return [{name: 'git_diff', input: {}}];
    }
    if (!state.toolResults.has('run_command')) {
      return [{name: 'run_command', input: {command: 'git add -A'}}];
    }
    if (!state.toolResults.has('git_commit')) {
      return [{name: 'git_commit', input: {message: extractCommitMessage(prompt)}}];
    }
    return [];
  }

  if (replaceInstruction) {
    if (!state.toolResults.has('read_file')) {
      return [{name: 'read_file', input: {path: replaceInstruction.path}}];
    }
    if (!state.toolResults.has('edit_file')) {
      return [{
        name: 'edit_file',
        input: {
          path: replaceInstruction.path,
          replace: replaceInstruction.replace,
          search: replaceInstruction.search,
        },
      }];
    }
    if (/run test|failing tests|npm test/u.test(lowerPrompt) && !state.toolResults.has('test_runner')) {
      return [{name: 'test_runner', input: {}}];
    }
    return [];
  }

  if (nextExplicitPath && readCount < 5) {
    return [{name: 'read_file', input: {path: nextExplicitPath}}];
  }

  if (/run test|failing tests|npm test/u.test(lowerPrompt) && !state.toolResults.has('test_runner')) {
    return [{name: 'test_runner', input: {}}];
  }

  // Generic tool use detection
  // Handle MCP tools: "use the mcp echo tool" → "mcp:echo-test.echo"
  // Handle generic tool calls: "use the echo plugin" → "echo-plugin"
  if (state.toolCalls.length === 0) {
    if (/mcp\s+fail/iu.test(prompt)) {
      return [{name: 'mcp:echo-test.fail', input: {}}];
    }
    if (/mcp\s+echo/iu.test(prompt)) {
      return [{name: 'mcp:echo-test.echo', input: {}}];
    }

    // Generic plugin tool detection
    const pluginMatch = prompt.match(/(?:use|call|execute|run)\s+(?:the\s+)?([a-z0-9_.-]+)\s+plugin/iu);
    if (pluginMatch && pluginMatch[1]) {
      const toolName = `${pluginMatch[1]}-plugin`;
      return [{name: toolName, input: {}}];
    }
  }

  return [];
};

const generateResponse = (messages: ProviderMessage[]): {text: string; toolCalls: Array<{name: string; input: Record<string, unknown>}>} => {
  const state = getState(messages);
  const prompt = state.currentPrompt;
  const lowerPrompt = prompt.toLowerCase();

  if (/reply with ok/u.test(lowerPrompt) && state.toolResults.size === 0) {
    return {text: 'OK', toolCalls: []};
  }

  const toolCalls = decideToolCalls(messages);
  if (toolCalls.length > 0) {
    return {text: '', toolCalls};
  }

  if (/explain this repo|explain this codebase/u.test(lowerPrompt)) {
    return {
      text: 'ApeironCode mock analysis:\n- Terminal-native TypeScript CLI\n- Agent loop, provider registry, tool registry\n- Focus: diagnostics, context ranking, loop control',
      toolCalls: [],
    };
  }

  if (/review.*diff|code review/u.test(lowerPrompt)) {
    const diffOutput = state.toolResults.get('git_diff') ?? '';
    return {
      text: diffOutput.trim()
        ? 'Code review generated from mock provider.\nNote: No semantic analysis available from mock.'
        : 'No changes found. Working tree appears clean.',
      toolCalls: [],
    };
  }

  if (
    state.toolCalls.some((call) => ['edit_file', 'git_commit', 'mcp:echo-test.echo', 'mcp:echo-test.fail', 'test_runner'].includes(call.name))
  ) {
    return {
      text: buildExecutionSummary(state, prompt),
      toolCalls: [],
    };
  }

  return {
    text: 'Mock provider completed the task.',
    toolCalls: [],
  };
};

export class MockProvider implements ModelProvider {
  readonly name = 'mock';
  readonly displayName = 'Mock Provider';
  readonly supportsStreaming = true;
  readonly supportsToolCalling = true;
  readonly nativeToolFormat = 'anthropic' as const;

  listModels(): Promise<string[]> {
    return Promise.resolve(['mock-coder']);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async *stream(options: ProviderChatOptions): AsyncGenerator<ProviderStreamChunk> {
    const {text, toolCalls} = generateResponse(options.messages);

    // Emit tool calls if any
    for (const toolCall of toolCalls) {
      const toolInputJson = JSON.stringify(toolCall.input);
      const toolUseId = `tool_${Date.now()}`;

      yield {
        type: 'tool_use_start',
        toolName: toolCall.name,
        toolUseId,
      };

      yield {
        type: 'tool_use_delta',
        toolUseId,
        toolInputDelta: toolInputJson,
      };

      yield {
        type: 'tool_use_end',
        toolUseId,
      };
    }

    // Emit text tokens
    for (const token of text.split(/(\s+)/u)) {
      if (token) {
        yield {
          type: 'token',
          token,
        };
      }
    }

    // Emit completion
    yield {
      type: 'done',
      usage: {
        inputTokens: options.messages.length * 8,
        outputTokens: Math.max(4, Math.ceil((text.length + toolCalls.length * 50) / 10)),
        totalTokens: options.messages.length * 8 + Math.max(4, Math.ceil((text.length + toolCalls.length * 50) / 10)),
      },
    };
  }
}