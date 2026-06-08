import {iterationsBelow, toolWasNotCalled} from '../assertions.js';
import type {EvalSuite} from '../types.js';

export const contextIntelligenceSuite: EvalSuite = {
  cases: [{
    assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
    description: 'Explain that explicit file mentions become full files.',
    id: 'context-explicit-file-fullfile',
    mode: 'explain',
    prompt: 'When the user mentions src/foo.ts in the prompt, ApeironCode should treat it as a full file in context.',
  }, {
    assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
    description: 'Explain failing-test-to-source mapping.',
    id: 'context-failing-test-to-source',
    mode: 'explain',
    prompt: 'Explain how a failing test like tests/foo.test.ts maps to the source file src/foo.ts so the agent can include both.',
  }, {
    assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
    description: 'Explain that source edits should pull related test files.',
    id: 'context-source-pulls-tests',
    mode: 'explain',
    prompt: 'When editing src/foo.ts, ApeironCode should also pull in tests/foo.test.ts as related context.',
  }, {
    assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
    description: 'Explain dependent files for refactor.',
    id: 'context-refactor-imports-dependents',
    mode: 'explain',
    prompt: 'During refactor of an exported function, ApeironCode should bring in the files that import it.',
  }, {
    assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
    description: 'Explain symbol-to-file mapping.',
    id: 'context-symbol-to-file',
    mode: 'explain',
    prompt: 'When a prompt references a function name like computeTotal, ApeironCode should rank files that define or reference that symbol higher.',
  }, {
    assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
    description: 'Review prompt prioritizes changed files.',
    id: 'context-review-prioritizes-changed',
    mode: 'review',
    prompt: 'During PR review, ApeironCode should prioritize uncommitted/staged/changed files over the rest of the repo.',
  }, {
    assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
    description: 'Explain tasks prefer summaries over full files.',
    id: 'context-explain-prefers-summaries',
    mode: 'explain',
    prompt: 'For an explain-style prompt, ApeironCode should prefer compressed file summaries instead of dumping full file contents.',
  }, {
    assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
    description: 'Connector/MCP/GitHub tasks should not scan whole repo.',
    id: 'context-connector-no-full-scan',
    mode: 'explain',
    prompt: 'Connector, GitHub automation, and MCP-only prompts should not include the entire repo as context.',
  }, {
    assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
    description: 'Stale or corrupt context cache rebuilds safely.',
    id: 'context-cache-rebuild',
    mode: 'explain',
    prompt: 'When a context cache file is missing, stale, or corrupt, ApeironCode should rebuild it without crashing.',
  }, {
    assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
    description: 'Token budget is respected by context plan.',
    id: 'context-respects-token-budget',
    mode: 'explain',
    prompt: 'ApeironCode should compress and omit lower-signal files before exceeding the planned token budget.',
  }],
  description: 'Context Intelligence 2.0: file selection, symbol awareness, test mapping, failure mapping, and budget enforcement.',
  id: 'contextIntelligence',
};
