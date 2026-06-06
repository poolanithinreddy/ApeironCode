# REWRITE-2.0 Phase 1 Implementation Plan
## Native Tool Calling Infrastructure

**Scope**: Transform from custom XML tool directives to native provider tool calling  
**Timeline**: 1 session  
**Estimated Output**: 2,000–3,000 lines across 15 files

---

## Current State Assessment

### What Already Exists ✅
- Zod-based tool schemas in `src/tools/types.ts` (ToolDefinition)
- 30+ tools with input validation
- ToolRegistry managing tool registration
- UnifiedToolExecutor handling tool execution
- EventBus for cross-cutting concerns
- ToolExecutionContext with all needed metadata

### What Needs to Change 🔴
1. **Custom XML parsing** → Native tool calling
   - Current: `<apeironcode_tool_call>{...}</apeironcode_tool_call>`
   - Future: `Anthropic tools[]`, `OpenAI tools[]`, `Ollama tools[]`

2. **Message format** → Provider native format
   - Current: Single `ProviderMessage` with role/content
   - Future: ProviderMessage with optional `toolUse` content blocks

3. **Loop iteration** → Streaming-based
   - Current: `provider.chat()` returns complete message
   - Future: `provider.stream()` emits token-by-token events

4. **Provider implementations** → Streaming support
   - Current: Anthropic SDK 1.0 patterns (if any)
   - Future: SDK v3+ with streaming and native tool calling

---

## Implementation Strategy

### Phase 1A: Tool Schema System
**File**: `src/tools/schema.ts` (NEW)

Create the abstraction layer between tool definitions and provider formats:

```typescript
export interface ToolSchema<TInput = unknown> {
  name: string
  description: string
  category: 'file' | 'command' | 'web' | 'git' | 'test'
  inputSchema: ZodObject<any>
  execute: (input: TInput, context: ToolExecutionContext) => Promise<ToolResult>
}

export interface ProviderToolDefinition {
  // Anthropic format (the base format, others map to this)
  name: string
  description: string
  input_schema: JSONSchema7
}

export function zodToJsonSchema(schema: ZodSchema): JSONSchema7 {
  // Use zod-to-json-schema library
  // Must handle: string, number, boolean, enum, array, object, optional
}

export function toolSchemaToProviderDefinition(schema: ToolSchema): ProviderToolDefinition {
  return {
    name: schema.name,
    description: schema.description,
    input_schema: zodToJsonSchema(schema.inputSchema),
  }
}

export function getToolSchemasByProvider(
  toolRegistry: ToolRegistry,
  provider: 'anthropic' | 'openai' | 'ollama'
): Record<string, ProviderToolDefinition> {
  // Map provider-specific format (most will be same as Anthropic)
  // OpenAI format: { "name": "...", "description": "...", "parameters": {...} }
  // Ollama format: Same as Anthropic
}
```

### Phase 1B: Provider Message Types
**File**: `src/providers/types.ts` (REWRITE section)

Extend to support native tool calling:

```typescript
export interface ProviderStreamChunk {
  type: 'token' | 'tool_use_start' | 'tool_use_delta' | 'tool_use_end' | 'done'
  
  // For type='token'
  token?: string
  
  // For tool use
  toolName?: string
  toolUseId?: string
  toolInputDelta?: string  // incremental JSON object
  
  // For type='done'
  usage?: ProviderUsage
}

export interface ProviderChatOptions {
  model: string
  messages: ProviderMessage[]
  tools?: ProviderToolDefinition[]
  temperature?: number
  signal?: AbortSignal
}

export interface ModelProvider {
  readonly name: string
  readonly displayName: string
  readonly supportsStreaming: boolean
  readonly supportsToolCalling: boolean
  readonly nativeToolFormat: 'anthropic' | 'openai' | 'ollama'
  
  listModels(signal?: AbortSignal): Promise<string[]>
  
  // REMOVE: chat(options): Promise<ProviderChatResult>
  
  // NEW: streaming-first approach
  stream(options: ProviderChatOptions): AsyncGenerator<ProviderStreamChunk>
}
```

### Phase 1C: Tool Definition Rewrite
**Scope**: Every file in `src/tools/*.ts`

For each tool, add a `schema` export alongside existing definition:

**Example: readFile.ts**
```typescript
import {defineTool} from './types.js'
import {z} from 'zod'

const readFileInput = z.object({
  filePath: z.string().describe('Path to file to read'),
  limit: z.number().optional().describe('Max lines to read'),
  offset: z.number().optional().describe('Line number to start'),
})

export const readFileSchema: ToolSchema<z.infer<typeof readFileInput>> = {
  name: 'read_file',
  description: 'Read a source file or part of a file. Use for code inspection, finding symbols, reading tests.',
  category: 'file',
  inputSchema: readFileInput,
  execute: async (input, context) => {
    // Use existing readFileTool implementation
    return readFileTool.run(input, context)
  }
}

// Keep existing tool definition for backward compatibility
export const readFileTool = defineTool({...})
```

Tools to update (30 total):
- File ops: readFile, writeFile, editFile, patchFile, listFiles, glob, grep, revertPatch, fileInfo
- Git: gitStatus, gitDiff, gitCommit, gitLog, gitBranch, gitPrDescription
- Commands: runCommand, killCommand, commandStatus, commandOutput, commandSessions
- Build/Test/Lint: buildRunner, testRunner, lintRunner
- Web: webSearch, webFetch, webResearch
- Project: projectTree, packageInfo, todoWrite

### Phase 1D: Provider Implementations

**Anthropic** (`src/providers/anthropic.ts`)
- Use `@anthropic-ai/sdk@^3.0.0` (or newer)
- Implement `stream(options)` using `client.messages.stream()`
- Parse tool_use_start, tool_use_delta, tool_use_end
- Map to ProviderStreamChunk

**OpenAI** (`src/providers/openai.ts`)
- Use `openai@^4.0.0`
- Implement `stream(options)` using `client.chat.completions.create({ stream: true })`
- Handle function_call choice and tool_calls array
- Map to ProviderStreamChunk (convert from OpenAI format to Anthropic format)

**Ollama** (`src/providers/ollama.ts`)
- Use `/api/chat` with `stream: true`
- Handle tool calls in response
- Map to ProviderStreamChunk

**Mock** (`src/providers/mock.ts`)
- Emit fake tool_use_start, tool_use_delta, tool_use_end
- Deterministic for testing
- Support configurable behavior via options

### Phase 1E: Agent Loop Rewrite
**File**: `src/agent/loop.ts` (COMPLETE REWRITE)

```typescript
export const runAgentLoop = async (options: AgentLoopOptions): Promise<AgentRunResult> => {
  const messages = [...initialMessages]
  const toolCalls: ToolCallRecord[] = []
  let lastUsage: ProviderUsage | undefined
  const maxIterations = options.maxIterations ?? 40
  
  // Get tool definitions in provider format
  const toolDefinitions = getToolSchemasByProvider(
    toolRegistry,
    provider.nativeToolFormat
  )
  
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    eventBus?.emit({
      type: 'status.updated',
      message: 'Thinking',
      timestamp: createEventTimestamp(),
    })
    
    const streamOptions: ProviderChatOptions = {
      model,
      messages: toProviderMessages(messages, systemPrompt),
      tools: Object.values(toolDefinitions),
      temperature: 0.2,
      signal,
    }
    
    let currentMessage = ''
    const toolUseBuffer = new Map<string, {id: string; name: string; input: string}>()
    let activeToolUseId: string | undefined
    let shouldContinue = false
    
    try {
      for await (const chunk of provider.stream(streamOptions)) {
        if (chunk.type === 'token') {
          // Emit token event (for streaming UI)
          eventBus?.emit({
            type: 'token.streamed',
            token: chunk.token ?? '',
            messageId: messageId,
            timestamp: createEventTimestamp(),
          })
          currentMessage += chunk.token ?? ''
        } else if (chunk.type === 'tool_use_start') {
          activeToolUseId = chunk.toolUseId
          toolUseBuffer.set(activeToolUseId!, {
            id: activeToolUseId!,
            name: chunk.toolName!,
            input: '',
          })
        } else if (chunk.type === 'tool_use_delta') {
          if (activeToolUseId) {
            toolUseBuffer.get(activeToolUseId)!.input += chunk.toolInputDelta ?? ''
          }
        } else if (chunk.type === 'tool_use_end') {
          // Tool use is complete
          activeToolUseId = undefined
        } else if (chunk.type === 'done') {
          lastUsage = chunk.usage
          shouldContinue = toolUseBuffer.size > 0
        }
      }
    } catch (error) {
      // Handle streaming errors
      consecutiveErrors++
      if (consecutiveErrors >= maxConsecutiveErrors) {
        return {
          finalMessage: {...},
          messages,
          toolCalls,
          usage: lastUsage,
        }
      }
      continue
    }
    
    // If no tool calls, this is the final message
    if (toolUseBuffer.size === 0) {
      const finalMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: currentMessage.trim(),
        createdAt: new Date().toISOString(),
      }
      messages.push(finalMessage)
      eventBus?.emit({
        type: 'message.completed',
        message: finalMessage,
        timestamp: createEventTimestamp(),
      })
      return {
        finalMessage,
        messages,
        toolCalls,
        usage: lastUsage,
      }
    }
    
    // Add assistant message with tool uses
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: currentMessage,
      createdAt: new Date().toISOString(),
      // Store tool uses in metadata (or new field)
    }
    messages.push(assistantMessage)
    
    // Execute tools
    for (const [_, toolUse] of toolUseBuffer) {
      let toolInput: unknown
      try {
        toolInput = JSON.parse(toolUse.input)
      } catch {
        // Malformed JSON
        const toolResult: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'tool',
          content: `Tool call error: invalid JSON in tool input`,
          name: toolUse.name,
          createdAt: new Date().toISOString(),
        }
        messages.push(toolResult)
        continue
      }
      
      // Execute the tool
      const tool = toolRegistry.getTool(toolUse.name)
      if (!tool) {
        const toolResult: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'tool',
          content: `Tool not found: ${toolUse.name}`,
          name: toolUse.name,
          createdAt: new Date().toISOString(),
        }
        messages.push(toolResult)
        continue
      }
      
      const toolCall: ToolCallRecord = {
        id: crypto.randomUUID(),
        toolName: toolUse.name,
        input: toolInput,
        status: 'running',
        createdAt: new Date().toISOString(),
      }
      toolCalls.push(toolCall)
      
      eventBus?.emit({
        type: 'tool.started',
        toolName: toolUse.name,
        timestamp: createEventTimestamp(),
      })
      
      const result = await toolRegistry.execute(toolUse.name, toolInput, context)
      
      toolCall.status = result.ok ? 'completed' : 'failed'
      toolCall.output = result.output
      
      const toolResult: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'tool',
        content: result.output,
        name: toolUse.name,
        createdAt: new Date().toISOString(),
      }
      messages.push(toolResult)
      
      eventBus?.emit({
        type: 'tool.completed',
        toolName: toolUse.name,
        result,
        timestamp: createEventTimestamp(),
      })
    }
    
    // Check early exit condition
    if (iteration > 5) {
      const recentMessages = messages.slice(-6)
      const fileChanges = recentMessages.filter(m => m.role === 'tool').length
      if (fileChanges === 0) {
        // No file changes in last 3 iterations, likely done
        const finalMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'No further file changes needed. Task appears complete.',
          createdAt: new Date().toISOString(),
        }
        messages.push(finalMessage)
        return {
          finalMessage,
          messages,
          toolCalls,
          usage: lastUsage,
        }
      }
    }
  }
  
  // Reached max iterations
  const finalMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: `Reached maximum iterations (${maxIterations}). Please continue the conversation or start a new session.`,
    createdAt: new Date().toISOString(),
  }
  messages.push(finalMessage)
  return {
    finalMessage,
    messages,
    toolCalls,
    usage: lastUsage,
  }
}
```

### Phase 1F: Testing Infrastructure

**Files to create/update**:
- `tests/tools/schema.test.ts` — Test zodToJsonSchema output
- `tests/agent/loop.test.ts` — Mock provider streaming, tool execution
- `tests/providers/anthropic.test.ts` — Stream chunk parsing
- `tests/providers/openai.test.ts` — Stream chunk mapping
- `tests/providers/ollama.test.ts` — Stream parsing
- `tests/providers/mock.test.ts` — Deterministic behavior

---

## Detailed Checklist

### Before Starting Code

- [ ] Read and understand current loop.ts, planner.ts, provider implementations
- [ ] Confirm zod-to-json-schema library is available (or use built-in)
- [ ] Verify test structure (vitest + mock patterns)

### Implementation Order

1. **Create tool schema system** (`src/tools/schema.ts`)
   - zodToJsonSchema utility
   - toolSchemaToProviderDefinition
   - getToolSchemasByProvider

2. **Update provider types** (`src/providers/types.ts`)
   - Add ProviderStreamChunk
   - Update ProviderChatOptions
   - Update ModelProvider interface

3. **Rewrite provider implementations** (one at a time)
   - Mock first (simplest, no network)
   - Anthropic (if SDK available)
   - OpenAI (if SDK available)
   - Ollama (HTTP-based)

4. **Rewrite all tool definitions** (30 tools)
   - Keep existing, add schema export
   - Test with zodToJsonSchema

5. **Rewrite agent loop** (`src/agent/loop.ts`)
   - StreamChunk accumulation
   - Tool execution from native calls
   - Early exit detection

6. **Write comprehensive tests**
   - Mock streaming behavior
   - Tool execution flow
   - Error handling

7. **Integration validation**
   - Run full test suite
   - Manual testing with one provider

---

## Known Challenges & Mitigations

| Challenge | Mitigation |
|-----------|-----------|
| SDK availability | Mock provider first, test without real SDKs |
| Streaming parsing | Accumulate JSON in buffer before parse |
| Tool input validation | Use Zod for runtime validation |
| Error messages | Preserve existing error handling patterns |
| Backwards compat | Keep old code, feature-flag if needed |

---

## Success Criteria

✅ All tests pass (current 463 tests)
✅ New tests for streaming (50+ test cases)
✅ All 30 tools have schema exports
✅ Loop.ts works with at least one provider
✅ TypeScript strict mode, no `any`
✅ No file over 600 lines
✅ EventBus events for tokens, tools, messages

---

## Files Modified/Created

```
NEW:
  src/tools/schema.ts (150 lines)
  src/providers/streaming.ts (utils)
  tests/tools/schema.test.ts (80 lines)
  tests/agent/loop.test.ts (250 lines)

REWRITTEN:
  src/agent/loop.ts (500 lines)
  src/providers/types.ts (100 line additions)
  src/tools/*.ts (30 files, each +10-20 lines)

UPDATED:
  src/providers/anthropic.ts (or openai.ts, ollama.ts)
  tests/providers/*.test.ts

Total: ~2,000 lines of new/modified code
```

---

## Timeline Estimate

- Schema system: 1 hour
- Provider types: 30 minutes
- Mock provider: 1 hour
- One real provider (Anthropic): 2 hours
- Tool definitions (30 tools): 1 hour
- Loop rewrite: 2 hours
- Tests: 2 hours
- Integration & validation: 1 hour

**Total: ~10-12 hours of focused work**

