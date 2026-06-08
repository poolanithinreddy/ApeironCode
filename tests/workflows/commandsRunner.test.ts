import {describe, expect, it} from 'vitest';
import {renderCommandPrompt, runMarkdownCommand} from '../../src/workflows/commands/runner.js';
import type {CommandDefinition} from '../../src/workflows/types.js';

const makeCommand = (body: string, overrides: Partial<CommandDefinition> = {}): CommandDefinition => ({
  kind: 'command',
  source: 'project',
  filePath: '/fake/cmd.md',
  name: 'test-cmd',
  description: 'A test command.',
  aliases: [],
  body,
  allowedTools: [],
  permissionMode: 'inherit',
  requiresTrust: false,
  ...overrides,
});

describe('renderCommandPrompt', () => {
  it('renders {{args}} placeholder with provided args', () => {
    const cmd = makeCommand('Review changes against {{args}}.');
    const rendered = renderCommandPrompt(cmd, 'main');
    expect(rendered).toBe('Review changes against main.');
  });

  it('renders multiple occurrences of {{args}}', () => {
    const cmd = makeCommand('Args: {{args}}. Again: {{args}}.');
    const rendered = renderCommandPrompt(cmd, 'branch-name');
    expect(rendered).toBe('Args: branch-name. Again: branch-name.');
  });

  it('renders correctly with empty args', () => {
    const cmd = makeCommand('Prompt with no args used: {{args}} end.');
    const rendered = renderCommandPrompt(cmd, '');
    expect(rendered).toBe('Prompt with no args used:  end.');
  });

  it('does not execute template code', () => {
    const cmd = makeCommand('Review: {{args}}. Not code: ${eval("danger")}');
    const rendered = renderCommandPrompt(cmd, 'main');
    // No evaluation occurs — literal string preserved
    expect(rendered).toContain('${eval("danger")}');
  });

  it('truncates excessively long args', () => {
    const cmd = makeCommand('Prompt: {{args}}');
    const longArgs = 'x'.repeat(5_000);
    const rendered = renderCommandPrompt(cmd, longArgs);
    // Args are truncated at MAX_ARGS_LENGTH
    expect(rendered.length).toBeLessThan(4_000);
    expect(rendered).toContain('...');
  });
});

describe('runMarkdownCommand', () => {
  it('returns rendered prompt and metadata', () => {
    const cmd = makeCommand('Review {{args}}.', {
      allowedTools: ['git_diff', 'read_file'],
      permissionMode: 'strict',
    });
    const result = runMarkdownCommand(cmd, 'main', {cwd: '/project'});
    expect(result.prompt).toBe('Review main.');
    expect(result.name).toBe('test-cmd');
    expect(result.allowedTools).toEqual(['git_diff', 'read_file']);
    expect(result.permissionMode).toBe('strict');
  });
});
