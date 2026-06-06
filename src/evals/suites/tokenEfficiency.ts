import {customAssertion, toolWasCalled, toolWasNotCalled} from '../assertions.js';
import type {EvalSuite} from '../types.js';

const hasTokens = customAssertion('has token efficiency metrics', ({result}) =>
  Promise.resolve(result.tokenEfficiency.totalEstimatedTokens > 0 ? [] : ['Expected token metrics']));

export const tokenEfficiencySuite: EvalSuite = {
  cases: [
    {assertions: [hasTokens], description: 'Simple explanations use minimal/read-only schemas.', id: 'tokens-simple-minimal-tools', mode: 'explain', prompt: 'Explain package.json briefly.', expectedTools: ['read_file']},
    {assertions: [toolWasCalled('linear_get_issue'), toolWasNotCalled('write_file'), hasTokens], description: 'Connector prompts expose connector tools but not broad coding tools.', id: 'tokens-connector-tools', mode: 'chat', prompt: 'Check Linear issue ABC-1.', expectedTools: ['linear_get_issue']},
    {assertions: [toolWasCalled('test_runner'), hasTokens], description: 'Debug prompts preserve failing test output while compressing logs.', id: 'tokens-debug-output', mode: 'debug', prompt: 'Debug the failing test output.', expectedTools: ['test_runner'], tags: ['compressed']},
    {assertions: [hasTokens], description: 'Large context uses full, summary, and omitted tiers.', id: 'tokens-large-context', mode: 'feature', prompt: 'Implement feature across many files.', tags: ['large-context', 'compressed']},
    {assertions: [hasTokens], description: 'Memory context dedupes repeated facts.', id: 'tokens-memory-dedupe', mode: 'feature', prompt: 'Use remembered architecture constraints.', tags: ['memory']},
    {assertions: [hasTokens], description: 'Secret-like memory and tool output are redacted.', id: 'tokens-secret-redaction', mode: 'review', prompt: 'Review secret handling.', tags: ['memory', 'compressed']},
    {assertions: [hasTokens], description: 'Synthetic compressed context costs less than full context.', id: 'tokens-lower-than-baseline', mode: 'feature', prompt: 'Summarize large synthetic context.', tags: ['large-context', 'compressed']},
    {assertions: [toolWasCalled('read_file'), hasTokens], description: 'Correctness assertions still pass after compression.', id: 'tokens-correctness-after-compression', mode: 'fix', prompt: 'Read and fix the target file.', expectedTools: ['read_file'], tags: ['compressed']},
  ],
  description: 'Token efficiency, compression, and dynamic tool exposure checks.',
  id: 'token-efficiency',
};
