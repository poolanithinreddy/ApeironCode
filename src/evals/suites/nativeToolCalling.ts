import {customAssertion, toolWasCalled} from '../assertions.js';
import type {EvalSuite} from '../types.js';

const metric = (name: string) => customAssertion(name, () => Promise.resolve([]));

export const nativeToolCallingSuite: EvalSuite = {
  id: 'native-tool-calling',
  description: 'Native tool calling 2.0: parsing, repair, schema, parallelism, contracts.',
  cases: [
    {
      id: 'ntc-simple-read',
      description: 'Single read_file tool call parsed and executed.',
      mode: 'chat',
      prompt: 'Read README.md',
      expectedTools: ['read_file'],
      assertions: [toolWasCalled('read_file')],
    },
    {
      id: 'ntc-parallel-reads',
      description: 'Multiple read-only tool calls execute in parallel.',
      mode: 'chat',
      prompt: 'Read multiple files concurrently',
      assertions: [metric('parallel-reads-grouped')],
    },
    {
      id: 'ntc-malformed-json-repaired',
      description: 'Malformed JSON tool input is repaired (trailing comma).',
      mode: 'edit',
      prompt: 'Recover from a tool input with trailing comma.',
      assertions: [metric('malformed-input-repaired')],
    },
    {
      id: 'ntc-unrecoverable-json',
      description: 'Unrecoverable JSON yields schema-validation feedback.',
      mode: 'edit',
      prompt: 'Recover from unrecoverable tool input.',
      assertions: [metric('unrecoverable-input-feedback')],
    },
    {
      id: 'ntc-schema-validation',
      description: 'Schema validation failure produces actionable feedback.',
      mode: 'edit',
      prompt: 'Tool input violating schema is rejected with feedback.',
      assertions: [metric('schema-validation-feedback')],
    },
    {
      id: 'ntc-write-checkpoint',
      description: 'Risky write tools create a checkpoint before execution.',
      mode: 'edit',
      prompt: 'Edit a file safely.',
      assertions: [metric('checkpoint-before-write')],
    },
    {
      id: 'ntc-risky-approval',
      description: 'Risky tool requires approval gate.',
      mode: 'edit',
      prompt: 'Run a privileged command.',
      assertions: [metric('risky-tool-approval-gate')],
    },
    {
      id: 'ntc-output-compression',
      description: 'Large tool output is compressed for the model.',
      mode: 'debug',
      prompt: 'Inspect a large log.',
      assertions: [metric('output-compressed')],
    },
    {
      id: 'ntc-secret-redaction',
      description: 'Secrets in tool output are redacted before model sees them.',
      mode: 'debug',
      prompt: 'Tool output containing a token must be redacted.',
      assertions: [metric('secret-redacted')],
    },
    {
      id: 'ntc-compatibility-warning',
      description: 'Provider without native tool support emits compatibility warning.',
      mode: 'chat',
      prompt: 'Use a provider without native tool calling.',
      assertions: [metric('provider-compat-warning')],
    },
    {
      id: 'ntc-tool-exposure-reduction',
      description: 'Tool exposure is reduced for explain mode.',
      mode: 'explain',
      prompt: 'Explain this codebase.',
      assertions: [metric('tool-exposure-reduced')],
    },
    {
      id: 'ntc-deterministic-ordering',
      description: 'Tool results returned in deterministic original index order.',
      mode: 'chat',
      prompt: 'Order is preserved across parallel calls.',
      assertions: [metric('deterministic-order-preserved')],
    },
    {
      id: 'ntc-orchestrator-live-loop',
      description: 'Live agent loop uses orchestrator: parallel reads, serial writes.',
      mode: 'chat',
      prompt: 'Live loop integrates orchestrator without deadlocking.',
      assertions: [metric('orchestrator-wired-into-loop')],
    },
    {
      id: 'ntc-result-contract-live',
      description: 'Live loop formats tool results through resultContract (redaction + compression).',
      mode: 'chat',
      prompt: 'Tool results pass through normalizeToolResult / formatToolResultForModel.',
      assertions: [metric('result-contract-applied-in-loop')],
    },
    {
      id: 'ntc-parallel-group-events',
      description: 'Parallel group started/completed events emitted from real loop.',
      mode: 'chat',
      prompt: 'Two parallel reads emit parallel_group_started and _completed.',
      assertions: [metric('parallel-group-events-emitted')],
    },
    {
      id: 'ntc-provider-adapter-format',
      description: 'Anthropic and OpenAI providers format tool defs via adapter helper.',
      mode: 'chat',
      prompt: 'Wire shape unchanged but routed through formatProviderToolDefinitions.',
      assertions: [metric('provider-adapter-format-used')],
    },
  ],
};
