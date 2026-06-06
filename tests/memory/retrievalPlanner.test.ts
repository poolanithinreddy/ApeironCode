import {describe, expect, it} from 'vitest';
import {
  classifyRetrievalTask,
  planMemoryRetrieval,
  shouldIncludeEntity,
} from '../../src/memory/retrievalPlanner.js';

describe('classifyRetrievalTask', () => {
  it('classifies test-related prompts as test_fix', () => {
    expect(classifyRetrievalTask('Fix the failing vitest test in the auth module')).toBe('test_fix');
    expect(classifyRetrievalTask('The test spec is failing with assertion errors')).toBe('test_fix');
  });

  it('classifies debug prompts as debug', () => {
    expect(classifyRetrievalTask('Debug the error in the API handler')).toBe('debug');
    expect(classifyRetrievalTask('There is a crash in the main loop')).toBe('debug');
  });

  it('classifies architecture prompts', () => {
    expect(classifyRetrievalTask('Describe the system architecture and dependencies')).toBe('architecture');
    expect(classifyRetrievalTask('What is the monorepo structure?')).toBe('architecture');
  });

  it('classifies github prompts', () => {
    expect(classifyRetrievalTask('Create a PR for this issue fix')).toBe('github');
    expect(classifyRetrievalTask('Check the CI workflow status')).toBe('github');
  });

  it('classifies mcp prompts', () => {
    expect(classifyRetrievalTask('Configure the MCP stdio server')).toBe('mcp');
  });

  it('does not classify ordinary prompt work as mcp', () => {
    expect(classifyRetrievalTask('update src/agent/Agent.ts memory prompt retrieval')).toBe('edit');
  });

  it('classifies edit prompts', () => {
    expect(classifyRetrievalTask('Refactor the auth middleware')).toBe('edit');
    expect(classifyRetrievalTask('Add a new endpoint to the router')).toBe('edit');
  });

  it('classifies explain prompts', () => {
    expect(classifyRetrievalTask('What is the purpose of this function?')).toBe('explain');
    expect(classifyRetrievalTask('Describe how the build pipeline works')).toBe('explain');
  });

  it('falls back to unknown for generic prompts', () => {
    expect(classifyRetrievalTask('blah blah something')).toBe('unknown');
  });
});

describe('planMemoryRetrieval', () => {
  it('returns a plan with all required fields', () => {
    const plan = planMemoryRetrieval('Fix the failing test');
    expect(plan.taskType).toBe('test_fix');
    expect(plan.kinds.length).toBeGreaterThan(0);
    expect(plan.scopes.length).toBeGreaterThan(0);
    expect(typeof plan.maxItems).toBe('number');
    expect(typeof plan.maxTokens).toBe('number');
    expect(typeof plan.minConfidence).toBe('number');
    expect(typeof plan.explanation).toBe('string');
    expect(plan.excludeSuperseded).toBe(true);
  });

  it('uses debug kinds for debug tasks', () => {
    const plan = planMemoryRetrieval('Debug the error in the handler');
    expect(plan.kinds).toContain('pitfall');
    expect(plan.kinds).toContain('fix_recipe');
  });

  it('uses architecture kinds for architecture tasks', () => {
    const plan = planMemoryRetrieval('Describe the system architecture');
    expect(plan.kinds).toContain('decision');
    expect(plan.kinds).toContain('project_fact');
  });

  it('respects overrides', () => {
    const plan = planMemoryRetrieval('explain how the build works', {
      maxItems: 3,
      maxTokens: 300,
      minConfidence: 0.6,
    });
    expect(plan.maxItems).toBe(3);
    expect(plan.maxTokens).toBe(300);
    expect(plan.minConfidence).toBe(0.6);
  });

  it('includes explanation text', () => {
    const plan = planMemoryRetrieval('Fix the failing test');
    expect(plan.explanation).toContain('test_fix');
  });

  it('includes conventions and global scope for shared test-fix guidance', () => {
    const plan = planMemoryRetrieval('Fix the failing auth test');
    expect(plan.kinds).toContain('convention');
    expect(plan.scopes).toContain('global');
  });

  it('debug tasks use project scope only', () => {
    const plan = planMemoryRetrieval('Debug the crash');
    expect(plan.scopes).toContain('project');
  });

  it('architecture tasks include global scope', () => {
    const plan = planMemoryRetrieval('Describe the system architecture');
    expect(plan.scopes).toContain('global');
  });
});

describe('shouldIncludeEntity', () => {
  it('includes entity when kind is in plan', () => {
    const plan = planMemoryRetrieval('Fix the failing test');
    expect(shouldIncludeEntity('fix_recipe', plan)).toBe(true);
    expect(shouldIncludeEntity('pitfall', plan)).toBe(true);
  });

  it('excludes entity when kind is not in plan', () => {
    const plan = planMemoryRetrieval('Fix the failing test');
    expect(shouldIncludeEntity('session_summary', plan)).toBe(false);
  });
});
