export class McpConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpConfigurationError';
  }
}

export class McpPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpPermissionError';
  }
}

export const normalizeMcpError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));
