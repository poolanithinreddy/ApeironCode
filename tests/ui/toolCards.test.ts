import {describe, expect, it} from 'vitest';

import {buildToolCardView, humanizeToolName, renderBrainContextCard, renderDiffSummaryCard, renderErrorCard, renderPermissionCard, renderTaskCard, renderToolLine, renderToolResultCard, renderToolStartCard} from '../../src/ui/toolCards.js';
import {stripAnsi} from '../../src/ui/theme.js';

const toolCall = (overrides: Record<string, unknown> = {}) => ({
  id: 't1',
  toolName: 'read_file',
  status: 'success',
  input: {},
  ...overrides,
});

describe('tool cards', () => {
  it('renders safe compact cards', () => {
    const output = [
      renderToolStartCard({toolName: 'read_file'}, {colorMode: 'no-color'}),
      renderToolResultCard({ok: false, toolName: 'run_command', output: 'sk-secret1234567890 failed'}, {colorMode: 'no-color'}),
      renderPermissionCard({action: 'edit package.json', risk: 'medium'}, {colorMode: 'no-color'}),
      renderDiffSummaryCard({files: 2, insertions: 4, deletions: 1}, {colorMode: 'no-color'}),
      renderTaskCard({id: 'abc', status: 'running', title: 'Fix tests'}, {colorMode: 'no-color'}),
      renderBrainContextCard({status: 'active', files: 3, tokens: 500}, {colorMode: 'no-color'}),
      renderErrorCard({message: 'Something failed'}, {colorMode: 'no-color'}),
    ].map(stripAnsi).join('\n');
    expect(output).toContain('[tool start]');
    expect(output).toContain('[permission required]');
    expect(output).not.toContain('sk-secret');
  });
});

describe('compact tool lines (Phase 18B)', () => {
  it('humanizes tool names', () => {
    expect(humanizeToolName('read_file')).toBe('Read');
    expect(humanizeToolName('write_file')).toBe('Write');
    expect(humanizeToolName('run_command')).toBe('Run');
    expect(humanizeToolName('mystery_tool')).toBe('Mystery Tool');
  });

  it('read_file shows the file only (no diff)', () => {
    const line = renderToolLine(toolCall({input: {path: 'calculator/index.html'}}));
    expect(line).toBe('✓ Read calculator/index.html');
  });

  it('write_file shows file plus a compact diff summary', () => {
    const line = renderToolLine(toolCall({
      toolName: 'write_file',
      input: {path: 'calculator/styles.css'},
      result: {metadata: {addedLines: 42, removedLines: 12, editId: 'e1'}},
    }));
    expect(line).toContain('Write calculator/styles.css');
    expect(line).toContain('+42/-12');
    expect(line).toContain('/revert e1');
  });

  it('run_command shows the command with a success marker', () => {
    const line = renderToolLine(toolCall({toolName: 'run_command', input: {command: 'npm run build'}}));
    expect(line).toBe('✓ Run npm run build');
  });

  it('failure shows a concise tool-specific error', () => {
    const line = renderToolLine(toolCall({toolName: 'read_file', status: 'error', error: 'read_file requires path', input: {}}));
    expect(line.startsWith('✗ Read')).toBe(true);
    expect(line).toContain('read_file requires path');
  });

  it('never embeds a raw diff in the compact line', () => {
    const view = buildToolCardView(toolCall({
      toolName: 'write_file',
      input: {path: 'a.css'},
      result: {summary: 'wrote', metadata: {addedLines: 5, removedLines: 1}},
    }));
    expect(view.diffSummary).toBe('+5/-1');
    const line = renderToolLine(toolCall({
      toolName: 'write_file',
      input: {path: 'a.css'},
      result: {summary: 'wrote', diff: '--- a/a.css\n+++ b/a.css\n+body{}', metadata: {addedLines: 5, removedLines: 1}},
    }));
    expect(line).not.toContain('+++');
    expect(line).not.toContain('body{}');
  });

  it('redacts secrets in targets', () => {
    const line = renderToolLine(toolCall({toolName: 'run_command', input: {command: 'export API_KEY=supersecretvalue'}}));
    expect(line).not.toContain('supersecretvalue');
  });
});
