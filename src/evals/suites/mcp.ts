import {iterationsBelow, toolWasNotCalled} from '../assertions.js';
import type {EvalSuite} from '../types.js';

export const mcpSuite: EvalSuite = {
  cases: [{
    assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
    description: 'Explain MCP tool discovery.',
    id: 'mcp-tool-listing',
    mode: 'explain',
    prompt: 'Explain how ApeironCode lists MCP tools without making a real network call.',
  }, {
    assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
    description: 'Explain denied MCP tool calls.',
    id: 'mcp-tool-denied',
    mode: 'explain',
    prompt: 'Explain why a denied high-risk MCP tool must not run.',
  }, {
    assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
    description: 'Explain MCP OAuth status without revealing tokens.',
    id: 'mcp-oauth-status',
    mode: 'explain',
    prompt: 'Explain how MCP auth status can say authenticated, expired, refresh_available, or missing without printing token values.',
  }, {
    assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
    description: 'Explain HTTP/SSE MCP tool registration.',
    id: 'mcp-http-sse-registration',
    mode: 'explain',
    prompt: 'Explain how HTTP and SSE MCP servers are loaded into the ToolRegistry like stdio servers.',
  }, {
    assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
    description: 'Explain MCP resources and output limits.',
    id: 'mcp-resource-output-limit',
    mode: 'explain',
    prompt: 'Explain MCP resource reads and output limits.',
  }, {
    assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
    description: 'Explain MCP doctor offline checks.',
    id: 'mcp-doctor-offline',
    mode: 'explain',
    prompt: 'Explain how `apeironcode doctor` summarizes MCP transport configuration, auth status, and permissions without making any real MCP network calls by default.',
  }, {
    assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
    description: 'Explain explicit MCP resource-to-context.',
    id: 'mcp-resource-add-to-context',
    mode: 'explain',
    prompt: 'Explain why adding an MCP resource to chat context must redact known secrets, compress large payloads, and clearly label the resource source.',
  }, {
    assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
    description: 'Explain explicit prompt injection requirement.',
    id: 'mcp-prompt-injection-explicit',
    mode: 'explain',
    prompt: 'Explain why an MCP prompt should always be previewed first and only injected into the conversation after explicit user approval.',
  }],
  description: 'MCP discovery, permissions, resources, and output-limit checks.',
  id: 'mcp',
};
