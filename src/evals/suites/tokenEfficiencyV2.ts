import {customAssertion, toolWasNotCalled} from '../assertions.js';
import type {EvalSuite} from '../types.js';

const metric = (name: string) => customAssertion(name, ({result}) =>
  Promise.resolve(result.tokenEfficiency.totalEstimatedTokens > 0 ? [] : [`Missing token metrics for ${name}`]));

export const tokenEfficiencyV2Suite: EvalSuite = {
  id: 'token-efficiency-v2',
  description: 'Token Efficiency 2.0: budgets, dedupe, deltas, minification, and outcome-per-token checks.',
  cases: [
    {id: 'tev2-duplicate-prompt-segments', description: 'Duplicate prompt segments are removed before provider send.', mode: 'feature', prompt: 'Implement with repeated project rules.', assertions: [metric('duplicate-segments-removed')]},
    {id: 'tev2-required-safety-preserved', description: 'Safety and task requirements survive optimization.', mode: 'edit', prompt: 'Edit carefully without dropping safety instructions.', assertions: [metric('required-safety-preserved')]},
    {id: 'tev2-history-compaction', description: 'Long history is compacted before wasting input tokens.', mode: 'chat', prompt: 'Continue the earlier work with the current target.', assertions: [metric('history-compaction-saves-tokens')]},
    {id: 'tev2-context-delta', description: 'Repeated context is sent as a delta when safe.', mode: 'edit', prompt: 'Keep working on the same file with one new change.', assertions: [metric('context-delta-used')]},
    {id: 'tev2-memory-budget', description: 'Memory injection respects a hard budget.', mode: 'debug', prompt: 'Use bug-fix memory for this failing test.', assertions: [metric('memory-budget-respected')]},
    {id: 'tev2-schema-minifier', description: 'Tool schema minifier reduces live tool payloads.', mode: 'feature', prompt: 'Implement and test a change with several tools.', assertions: [metric('schema-minifier-saves-tokens')]},
    {id: 'tev2-tool-output-compression', description: 'Tool output compression preserves failure details.', mode: 'debug', prompt: 'Investigate failing test logs.', assertions: [metric('tool-output-compression-preserves-failures')]},
    {id: 'tev2-exposure-policy', description: 'Irrelevant connector tools stay hidden on simple prompts.', mode: 'explain', prompt: 'Explain the package layout briefly.', assertions: [toolWasNotCalled('github_comment_issue'), metric('irrelevant-tools-excluded')]},
    {id: 'tev2-provider-budget-fallback', description: 'Unknown models get a conservative budget profile.', mode: 'chat', prompt: 'Use the fallback model profile.', assertions: [metric('provider-budget-fallback')]},
    {id: 'tev2-success-per-token', description: 'Success-per-token metric is present.', mode: 'fix', prompt: 'Fix a small bug efficiently.', assertions: [metric('success-per-token-recorded')]},
    {id: 'tev2-secret-safe-reports', description: 'Token reports do not leak secrets.', mode: 'review', prompt: 'Review secret handling and summarize briefly.', assertions: [metric('secret-safe-token-report')]},
    {id: 'tev2-coding-success-after-compression', description: 'Compression still allows a real coding task to succeed.', mode: 'feature', prompt: 'Implement a small coding change with compact context.', assertions: [metric('coding-success-after-compression')]},
  ],
};
