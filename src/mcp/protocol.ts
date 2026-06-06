export interface JsonRpcRequest {
  id: string | number;
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown> | unknown[];
}

export interface JsonRpcResponse<T = unknown> {
  error?: {code: number; data?: unknown; message: string};
  id: string | number | null;
  jsonrpc: '2.0';
  result?: T;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown> | unknown[];
}

export class McpProtocolError extends Error {
  constructor(
    message: string,
    readonly code = 0,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = 'McpProtocolError';
  }
}

export const buildRequest = (
  id: string | number,
  method: string,
  params?: Record<string, unknown> | unknown[],
): JsonRpcRequest => ({
  id,
  jsonrpc: '2.0',
  method,
  ...(params !== undefined ? {params} : {}),
});

export const isJsonRpcResponse = (value: unknown): value is JsonRpcResponse => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const v = value as {jsonrpc?: unknown};
  return v.jsonrpc === '2.0';
};

export interface InitializeResult {
  capabilities: {
    prompts?: Record<string, unknown>;
    resources?: Record<string, unknown>;
    tools?: Record<string, unknown>;
  };
  protocolVersion: string;
  serverInfo: {name: string; version: string};
}

export interface McpToolDefinition {
  description?: string;
  inputSchema?: {
    properties?: Record<string, unknown>;
    required?: string[];
    type?: string;
  };
  name: string;
}

export interface McpToolCallContent {
  data?: string;
  mimeType?: string;
  text?: string;
  type: 'text' | 'image' | 'resource';
}

export interface McpToolCallResult {
  content: McpToolCallContent[];
  isError?: boolean;
}

export interface McpResource {
  description?: string;
  mimeType?: string;
  name?: string;
  uri: string;
}

export interface McpResourceContents {
  contents: Array<{
    blob?: string;
    mimeType?: string;
    text?: string;
    uri: string;
  }>;
}

export interface McpPrompt {
  arguments?: Array<{description?: string; name: string; required?: boolean}>;
  description?: string;
  name: string;
}

export interface McpPromptResult {
  description?: string;
  messages: Array<{
    content: {text?: string; type: string};
    role: string;
  }>;
}
