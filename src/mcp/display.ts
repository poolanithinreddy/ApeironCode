import type {ConfiguredMcpEndpoint} from './endpoints.js';
import type {McpServerDiagnostics, McpServerTestResult} from './manager.js';
import type {McpTool} from './types.js';

const formatStderr = (stderr: string[]): string | null => {
  if (stderr.length === 0) {
    return null;
  }

  return ['Stderr:', ...stderr.slice(-5).map((line) => `  ${line}`)].join('\n');
};

const formatDiagnostics = (diagnostics: McpServerDiagnostics): string[] => {
  return [
    `Server: ${diagnostics.serverName}`,
    `Transport: ${diagnostics.endpointType}`,
    `Connected: ${diagnostics.connected ? 'yes' : 'no'}`,
    diagnostics.serverInfo ? `Server info: ${diagnostics.serverInfo.name}@${diagnostics.serverInfo.version}` : null,
    `Tools: ${diagnostics.toolCount}`,
    diagnostics.lastError ? `Last error: ${diagnostics.lastError}` : null,
    formatStderr(diagnostics.stderr),
  ].filter((value): value is string => Boolean(value));
};

export const formatMcpEndpointList = (endpoints: ConfiguredMcpEndpoint[]): string => {
  if (endpoints.length === 0) {
    return 'No MCP endpoints configured.';
  }

  return endpoints
    .map((endpoint) => `${endpoint.server.name} | ${endpoint.server.type} | ${endpoint.source}:${endpoint.sourceLabel}`)
    .join('\n');
};

export const formatMcpToolList = ({
  diagnostics,
  tools,
}: {
  diagnostics: McpServerDiagnostics;
  tools: McpTool[];
}): string => {
  return [
    ...formatDiagnostics(diagnostics),
    tools.length > 0 ? 'Available tools:' : 'Available tools: none',
    ...tools.map((tool) => `- ${tool.name} — ${tool.description ?? 'No description'}`),
  ].join('\n');
};

export const formatMcpTestResult = (result: McpServerTestResult): string => {
  return [
    `Status: ${result.ok ? 'ok' : 'failed'}`,
    ...formatDiagnostics(result.diagnostics),
  ].join('\n');
};