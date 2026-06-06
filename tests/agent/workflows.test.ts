import {describe, expect, it} from 'vitest';

import type {ProjectContextBundle} from '../../src/agent/context.js';
import {inferAgentMode, resolveAgentWorkflow} from '../../src/agent/workflows/index.js';

const projectContext: ProjectContextBundle = {
  codeIntelligenceSummary: 'Code Intelligence: Fallback code intelligence (TypeScript LSP unavailable)',
  contextSelectionExplanation: 'Context selection (0 files analyzed): No files ranked above threshold using multi-signal analysis.',
  contextSelectionSummary: 'Context selection: test fixture',
  memoryGraphSummary: 'Memory graph facts used: none',
  plan: 'Generic project plan',
  projectScan: {
    buildCommand: 'npm run build',
    configFiles: ['package.json'],
    entrypoints: ['src/index.ts'],
    frameworks: ['TypeScript'],
    git: {
      branch: 'main',
      changedFiles: 0,
      changedPaths: [],
      isRepo: true,
    },
    languages: ['TypeScript'],
    lintCommand: 'npm run lint',
    manifests: [],
    monorepo: false,
    packageManager: 'npm',
    projectName: 'opencode',
    projectSummary: 'TypeScript CLI project',
    sourceDirectories: ['src'],
    testCommand: 'npm test',
    workspaces: [],
  },
  promptContext: 'Prompt context',
  relevantFiles: [
    {
      estimatedTokens: 24,
      path: 'src/agent/loop.ts',
      reason: ['contains agent loop'],
      score: 24,
      size: 128,
      snippet: 'export const runAgentLoop = async () => {}',
    },
  ],
};

describe('workflow resolution', () => {
  it('infers explain mode from repo walkthrough prompts', () => {
    expect(inferAgentMode('chat', 'Explain this codebase and architecture')).toBe('explain');
  });

  it('respects explicit feature mode and builds a feature workflow', () => {
    const workflow = resolveAgentWorkflow({
      mode: 'feature',
      projectContext,
      prompt: 'Add a command palette to the TUI',
    });

    expect(workflow?.id).toBe('implement-feature');
    expect(workflow?.plan).toContain('Add a command palette to the TUI');
    expect(workflow?.plan).toContain('Code Intelligence: Fallback code intelligence');
    expect(workflow?.promptAddendum).toContain('Implement Feature');
    expect(workflow?.promptAddendum).toContain('Code Intelligence: Fallback code intelligence');
  });

  it('routes fix mode through the debug workflow', () => {
    const workflow = resolveAgentWorkflow({
      mode: 'fix',
      projectContext,
      prompt: 'Investigate why the agent loop stalls on malformed tool output',
    });

    expect(workflow?.id).toBe('debug-error');
    expect(workflow?.mode).toBe('fix');
  });
});
