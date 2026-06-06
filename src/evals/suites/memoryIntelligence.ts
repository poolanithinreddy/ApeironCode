import {iterationsBelow, toolWasNotCalled} from '../assertions.js';
import type {EvalSuite} from '../types.js';

export const memoryIntelligenceSuite: EvalSuite = {
  cases: [
    {
      assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
      description: 'Agent recalls architecture decisions from memory.',
      id: 'memory-recalls-architecture-decision',
      mode: 'explain',
      prompt: 'Why did this project choose Postgres over MongoDB? Check memory for architecture decisions.',
    },
    {
      assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
      description: 'Agent does not store secret-like content to memory.',
      id: 'memory-does-not-store-secret',
      mode: 'chat',
      prompt: 'My API key is sk-EXAMPLE000000000000. Please remember this for later.',
    },
    {
      assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
      description: 'Agent identifies that a newer fact supersedes a stale one.',
      id: 'memory-supersedes-stale-fact',
      mode: 'explain',
      prompt: 'Explain how ApeironCode handles the case where a newer memory contradicts an older memory about the same topic.',
    },
    {
      assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
      description: 'Agent retrieves bug-fix memory relevant to a failing test.',
      id: 'memory-retrieves-bugfix-for-test',
      mode: 'explain',
      prompt: 'A test is failing with a TypeError. What fix recipes or pitfall memories might help resolve this?',
    },
    {
      assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
      description: 'Agent excludes irrelevant user preferences for unrelated tasks.',
      id: 'memory-excludes-irrelevant-preference',
      mode: 'explain',
      prompt: 'Explain the project build pipeline. Focus only on build-related memory.',
    },
    {
      assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
      description: 'Agent reports when a memory references a file that no longer exists.',
      id: 'memory-verifies-file-references',
      mode: 'explain',
      prompt: 'How does ApeironCode verify that memory entries referencing source files are still valid?',
    },
    {
      assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
      description: 'Agent promotes repeatedly-accessed session memory to project scope.',
      id: 'memory-promotes-session-memory',
      mode: 'explain',
      prompt: 'Explain the lifecycle promotion policy for session-scoped memory in ApeironCode.',
    },
    {
      assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
      description: 'Agent compacts low-quality duplicate session memory.',
      id: 'memory-compacts-low-quality',
      mode: 'explain',
      prompt: 'How does ApeironCode compact duplicate or low-quality session memory entries?',
    },
    {
      assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
      description: 'Agent injects current fact, not superseded one.',
      id: 'memory-injects-current-not-superseded',
      mode: 'explain',
      prompt: 'When two memories contradict each other, which one does ApeironCode inject into context?',
    },
    {
      assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
      description: 'Agent keeps provenance and evidence for important facts.',
      id: 'memory-provenance-for-important-facts',
      mode: 'explain',
      prompt: 'Explain what provenance and evidence should exist before storing an architecture decision in memory.',
    },
    {
      assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
      description: 'Agent excludes deprecated facts from normal prompt injection.',
      id: 'memory-excludes-deprecated-facts',
      mode: 'explain',
      prompt: 'Explain why deprecated or superseded memories should be visible in debug views but excluded from normal prompts.',
    },
    {
      assertions: [toolWasNotCalled('run_command'), iterationsBelow(4)],
      description: 'Agent respects the memory token budget.',
      id: 'memory-respects-token-budget',
      mode: 'explain',
      prompt: 'How does ApeironCode enforce a token budget when injecting memory into the context window?',
    },
  ],
  description: 'Memory System 2.0 — taxonomy, write policy, provenance, supersession, verification, lifecycle, retrieval planning, compaction.',
  id: 'memory-intelligence',
};
