import {describe, expect, it} from 'vitest';

import {getExposedToolsForContext} from '../../src/tools/exposurePolicy.js';

const ALL = [
  'read_file', 'grep', 'glob', 'list_files', 'edit_file', 'write_file',
  'patch_file', 'run_command', 'test_runner', 'lint_runner',
  'github_create_pr', 'github_list_issues', 'mcp:server.tool',
];

describe('getExposedToolsForContext', () => {
  it('explain mode excludes write tools', () => {
    const tools = getExposedToolsForContext(ALL, {mode: 'explain'});
    expect(tools).toContain('read_file');
    expect(tools).not.toContain('edit_file');
    expect(tools).not.toContain('write_file');
  });

  it('test-fix mode includes test_runner', () => {
    const tools = getExposedToolsForContext(ALL, {mode: 'test-fix'});
    expect(tools).toContain('test_runner');
    expect(tools).toContain('lint_runner');
    expect(tools).toContain('edit_file');
  });

  it('github prompt includes github tools', () => {
    const tools = getExposedToolsForContext(ALL, {prompt: 'open a github PR for this fix'});
    expect(tools).toContain('github_create_pr');
  });

  it('mcp prompt includes mcp tools', () => {
    const tools = getExposedToolsForContext(ALL, {prompt: 'use mcp server'});
    expect(tools).toContain('mcp:server.tool');
  });

  it('returns empty when provider does not support native tool calling', () => {
    const tools = getExposedToolsForContext(ALL, {providerCapabilities: {nativeToolCalling: false}});
    expect(tools).toEqual([]);
  });

  it('returns all tools by default', () => {
    const tools = getExposedToolsForContext(ALL, {});
    expect(tools.length).toBe(ALL.length);
  });
});
