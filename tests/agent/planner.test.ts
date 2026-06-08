import {describe, expect, it} from 'vitest';

import {analyzeToolDirectives, extractToolDirective, extractToolDirectives} from '../../src/agent/planner.js';

describe('extractToolDirective', () => {
  it('parses raw JSON directives', () => {
    const directive = extractToolDirective(
      '{"toolName":"read_file","input":{"path":"src/index.ts"},"explanation":"inspect entrypoint"}',
    );

    expect(directive?.toolName).toBe('read_file');
    expect(directive?.input.path).toBe('src/index.ts');
  });

  it('ignores normal markdown responses', () => {
    const directive = extractToolDirective('I reviewed the diff and found two issues.');

    expect(directive).toBeNull();
  });

  it('parses XML tool-call directives', () => {
    const directive = extractToolDirective(
      '<tool_call>{"name":"read_file","input":{"path":"src/index.ts"}}</tool_call>',
    );

    expect(directive?.toolName).toBe('read_file');
    expect(directive?.input.path).toBe('src/index.ts');
  });

  it('parses multiple tool-call blocks in one response', () => {
    const directives = extractToolDirectives([
      '<opencode_tool_call>{"toolName":"package_info","input":{}}</opencode_tool_call>',
      '<opencode_tool_call>{"toolName":"project_tree","input":{"depth":2}}</opencode_tool_call>',
    ].join('\n'));

    expect(directives).toHaveLength(2);
    expect(directives.map((directive) => directive.toolName)).toEqual([
      'package_info',
      'project_tree',
    ]);
  });

  it('marks malformed tool-call blocks so the loop can request a retry', () => {
    const analysis = analyzeToolDirectives(
      '<opencode_tool_call>{"toolName":"read_file","input":{"path":"src/index.ts"}</opencode_tool_call>',
    );

    expect(analysis.directives).toHaveLength(0);
    expect(analysis.malformed).toBe(true);
  });
});