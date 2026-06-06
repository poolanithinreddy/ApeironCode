import {z, type ZodTypeAny} from 'zod';
import type {ToolDefinition, ToolResult} from '../tools/types.js';
import {AppError} from '../utils/errors.js';
import type {McpClientV2} from './clientV2.js';
import {checkMcpToolPermission, classifyMcpToolRisk} from './permissions.js';
import type {McpToolCallResult, McpToolDefinition} from './protocol.js';
import type {McpServerConfig} from './serverConfig.js';

export const buildMcpToolName = (serverId: string, toolName: string): string =>
  `mcp:${serverId}.${toolName}`;

const buildInputSchema = (tool: McpToolDefinition): ZodTypeAny => {
  const required = new Set(tool.inputSchema?.required ?? []);
  const properties = tool.inputSchema?.properties ?? {};
  if (Object.keys(properties).length === 0) {
    return z.object({}).passthrough();
  }
  const shape: Record<string, ZodTypeAny> = {};
  for (const key of Object.keys(properties)) {
    const base = z.unknown();
    shape[key] = required.has(key) ? base : base.optional();
  }
  return z.object(shape).passthrough();
};

const flattenContent = (result: McpToolCallResult): string => {
  if (!result.content || result.content.length === 0) {
    return '(empty MCP response)';
  }
  return result.content.map((item) => {
    if (item.type === 'text') {
      return item.text ?? '';
    }
    if (item.type === 'image') {
      return `[image:${item.mimeType ?? 'unknown'}]`;
    }
    return '[resource]';
  }).join('\n').slice(0, 8000);
};

export interface McpToolRegistrationOptions {
  client: McpClientV2;
  config: McpServerConfig;
  tools: McpToolDefinition[];
}

export const buildMcpToolDefinitions = (options: McpToolRegistrationOptions): ToolDefinition[] => {
  return options.tools.map((tool) => {
    const name = buildMcpToolName(options.config.id, tool.name);
    const risk = classifyMcpToolRisk(tool.name);
    const requiresApproval = risk !== 'low';
    const inputSchema = buildInputSchema(tool);
    const definition: ToolDefinition = {
      description: buildDescription(options.config, tool, risk),
      displayName: `${options.config.name}: ${tool.name}`,
      inputSchema,
      name,
      requiresApproval,
      riskLevel: risk,
      run: async (input: unknown): Promise<ToolResult> => {
        const decision = checkMcpToolPermission(options.config, tool.name);
        if (!decision.allowed) {
          return {
            ok: false,
            output: '',
            summary: `MCP tool blocked: ${decision.reason}`,
          };
        }
        try {
          const result = await options.client.callTool(tool.name, (input ?? {}) as Record<string, unknown>);
          if (result.isError) {
            return {
              ok: false,
              output: flattenContent(result),
              summary: `MCP tool ${tool.name} returned an error.`,
            };
          }
          const output = flattenContent(result);
          return {
            metadata: {mcpServerId: options.config.id, mcpToolName: tool.name},
            ok: true,
            output,
            summary: `MCP ${options.config.id}.${tool.name} ok (${output.length} chars).`,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new AppError(`MCP tool call failed: ${message}`, 'MCP_TOOL_ERROR');
        }
      },
      source: 'mcp',
    };
    return definition;
  });
};

const buildDescription = (config: McpServerConfig, tool: McpToolDefinition, risk: string): string => {
  const lines = [
    `[MCP ${config.id}] ${tool.description ?? `Tool ${tool.name}`}`,
    risk === 'low' ? 'Read-only MCP operation.' : `${risk.toUpperCase()} risk action — requires approval.`,
    `Trust level: ${config.trustLevel}.`,
  ];
  return lines.join(' ');
};
