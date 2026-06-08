import type {McpServerConfig} from '../serverConfig.js';
import {HttpTransport} from './http.js';
import {SseTransport} from './sse.js';
import {StdioV2Transport} from './stdioV2.js';
import type {McpTransport, TransportFactoryOptions} from './types.js';

export const buildTransport = (
  config: McpServerConfig,
  options: TransportFactoryOptions = {},
): McpTransport => {
  if (config.transport === 'stdio') {
    if (!config.command) {
      throw new Error(`MCP server ${config.id}: stdio transport requires command.`);
    }
    return new StdioV2Transport({
      args: config.args,
      command: config.command,
      cwd: options.cwd,
      env: config.env,
      spawnImpl: options.spawnImpl,
      timeoutMs: config.timeoutMs,
    });
  }
  if (config.transport === 'http') {
    if (!config.url) {
      throw new Error(`MCP server ${config.id}: http transport requires url.`);
    }
    return new HttpTransport({
      fetchImpl: options.fetchImpl,
      headers: config.headers,
      timeoutMs: config.timeoutMs,
      url: config.url,
    });
  }
  if (config.transport === 'sse') {
    if (!config.url) {
      throw new Error(`MCP server ${config.id}: sse transport requires url.`);
    }
    return new SseTransport({
      fetchImpl: options.fetchImpl,
      headers: config.headers,
      timeoutMs: config.timeoutMs,
      url: config.url,
    });
  }
  throw new Error(`MCP server ${config.id}: unknown transport ${(config as {transport: string}).transport}.`);
};

export {HttpTransport, SseTransport, StdioV2Transport};
export type {McpTransport, TransportFactoryOptions};
