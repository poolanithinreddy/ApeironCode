import {describe, expect, it} from 'vitest';
import {buildContextPlan, classifyTaskType, explainContextPlan} from '../../src/context/contextPlan.js';

const baseFiles = [
  'src/foo.ts', 'src/bar.ts', 'src/baz.ts',
  'tests/foo.test.ts', 'tests/bar.test.ts',
  'package.json', 'README.md',
];

describe('classifyTaskType', () => {
  it('classifies based on prompt and mode', () => {
    expect(classifyTaskType('explain the auth module')).toBe('explain');
    expect(classifyTaskType('debug the crash on login')).toBe('debug');
    expect(classifyTaskType('fix the failing test for login')).toBe('test_fix');
    expect(classifyTaskType('refactor src/foo.ts to extract method')).toBe('refactor');
    expect(classifyTaskType('please review this PR')).toBe('review');
    expect(classifyTaskType('open a github pull request for this issue')).toBe('github_automation');
    expect(classifyTaskType('add a new mcp resource handler')).toBe('mcp');
    expect(classifyTaskType('add new connector for openai')).toBe('connector');
    expect(classifyTaskType('implement a search feature')).toBe('feature');
    expect(classifyTaskType('hello there')).toBe('unknown');
  });
});

describe('buildContextPlan', () => {
  it('promotes explicit file mentions to fullFiles', () => {
    const plan = buildContextPlan('Please look at src/foo.ts and update', baseFiles, {});
    expect(plan.fullFiles).toContain('src/foo.ts');
  });

  it('test_fix includes failing test file and source', () => {
    const plan = buildContextPlan('fix failing test login', baseFiles, {
      affected: {
        confidence: 0.6,
        configFiles: [],
        dependentFiles: [],
        directFiles: ['src/foo.ts'],
        reasons: [],
        testFiles: ['tests/foo.test.ts'],
      },
      failureSignals: [{confidence: 0.9, file: 'src/foo.ts', message: 'boom', source: 'test'}],
    });
    expect(plan.taskType).toBe('test_fix');
    expect(plan.fullFiles).toContain('src/foo.ts');
    expect(plan.testFiles).toContain('tests/foo.test.ts');
    expect(plan.fullFiles).toContain('tests/foo.test.ts');
  });

  it('refactor includes dependents as summaries and tests as tests', () => {
    const plan = buildContextPlan('refactor authentication', baseFiles, {
      affected: {
        confidence: 0.6,
        configFiles: [],
        dependentFiles: ['src/bar.ts'],
        directFiles: ['src/foo.ts'],
        reasons: [],
        testFiles: ['tests/foo.test.ts'],
      },
      changedFiles: ['src/foo.ts'],
    });
    expect(plan.taskType).toBe('refactor');
    expect(plan.fullFiles).toContain('src/foo.ts');
    expect(plan.summaryFiles).toContain('src/bar.ts');
    expect(plan.testFiles).toContain('tests/foo.test.ts');
  });

  it('explain prefers summaries over full files', () => {
    const plan = buildContextPlan('explain how src/foo.ts works', baseFiles);
    expect(plan.taskType).toBe('explain');
    expect(plan.summaryFiles).toContain('src/foo.ts');
  });

  it('review includes changed files', () => {
    const plan = buildContextPlan('please review', baseFiles, {changedFiles: ['src/foo.ts']});
    expect(plan.fullFiles).toContain('src/foo.ts');
  });

  it('github_automation excludes test files', () => {
    const plan = buildContextPlan('open a github pull request', baseFiles);
    expect(plan.taskType).toBe('github_automation');
    expect(plan.excludedFiles.some((e) => e.path === 'tests/foo.test.ts')).toBe(true);
  });

  it('respects token budget defaults', () => {
    expect(buildContextPlan('explain a thing', baseFiles).tokenBudget).toBeGreaterThan(0);
  });

  it('explainContextPlan produces deterministic output', () => {
    const plan = buildContextPlan('refactor src/foo.ts', baseFiles);
    const text = explainContextPlan(plan);
    expect(text).toContain('taskType');
    expect(text).toContain('Likely tools');
  });
});
