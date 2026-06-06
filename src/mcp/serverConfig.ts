import {z} from 'zod';
import {redactEnv, redactHeaders} from './redaction.js';

export type McpTransportKind = 'stdio' | 'http' | 'sse';
export type McpTrustLevel = 'low' | 'medium' | 'high';

export interface McpServerConfig {
  allowedTools?: string[];
  args?: string[];
  command?: string;
  deniedTools?: string[];
  enabled: boolean;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  id: string;
  name: string;
  outputTokenLimit?: number;
  timeoutMs?: number;
  transport: McpTransportKind;
  trustLevel: McpTrustLevel;
  url?: string;
}

const McpServerConfigSchema = z.object({
  allowedTools: z.array(z.string()).optional(),
  args: z.array(z.string()).optional(),
  command: z.string().optional(),
  deniedTools: z.array(z.string()).optional(),
  enabled: z.boolean(),
  env: z.record(z.string()).optional(),
  headers: z.record(z.string()).optional(),
  id: z.string().min(1),
  name: z.string().min(1),
  outputTokenLimit: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  transport: z.enum(['stdio', 'http', 'sse']),
  trustLevel: z.enum(['low', 'medium', 'high']),
  url: z.string().url().optional(),
});

export const validateMcpServerConfig = (input: unknown): McpServerConfig => {
  const parsed = McpServerConfigSchema.parse(input);
  if (parsed.transport === 'stdio' && !parsed.command) {
    throw new Error(`MCP server ${parsed.id}: stdio transport requires "command".`);
  }
  if ((parsed.transport === 'http' || parsed.transport === 'sse') && !parsed.url) {
    throw new Error(`MCP server ${parsed.id}: ${parsed.transport} transport requires "url".`);
  }
  return parsed;
};

export const validateMcpServerConfigList = (input: unknown[]): McpServerConfig[] =>
  input.map(validateMcpServerConfig);

export interface SafeServerConfigSummary {
  allowedTools?: string[];
  args?: string[];
  command?: string;
  deniedTools?: string[];
  enabled: boolean;
  env: Record<string, string>;
  headers: Record<string, string>;
  id: string;
  name: string;
  outputTokenLimit?: number;
  timeoutMs?: number;
  transport: McpTransportKind;
  trustLevel: McpTrustLevel;
  url?: string;
}

export const summarizeServerConfig = (config: McpServerConfig): SafeServerConfigSummary => ({
  allowedTools: config.allowedTools,
  args: config.args,
  command: config.command,
  deniedTools: config.deniedTools,
  enabled: config.enabled,
  env: redactEnv(config.env),
  headers: redactHeaders(config.headers),
  id: config.id,
  name: config.name,
  outputTokenLimit: config.outputTokenLimit,
  timeoutMs: config.timeoutMs,
  transport: config.transport,
  trustLevel: config.trustLevel,
  url: config.url,
});
