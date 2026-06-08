import {describe, it, expect} from 'vitest';
import {
  buildUnknownCommandResult,
  mapMentionToWorkflow,
  resolveMentionFromComment,
} from '../../src/githubAutomation/commentCommands.js';

describe('mention command parsing', () => {
  it('returns null when no mention present', () => {
    expect(resolveMentionFromComment('LGTM')).toBeNull();
    expect(resolveMentionFromComment(undefined)).toBeNull();
    expect(resolveMentionFromComment('')).toBeNull();
  });

  it('parses a known implement command', () => {
    const mention = resolveMentionFromComment('Hey @opencode implement this please');
    expect(mention).not.toBeNull();
    expect(mention?.command).toBe('implement');
    expect(mention?.known).toBe(true);
    expect(mention?.args).toEqual(['this', 'please']);
  });

  it('parses review command across multiple lines', () => {
    const mention = resolveMentionFromComment('first line\n@opencode review');
    expect(mention?.command).toBe('review');
    expect(mention?.known).toBe(true);
  });

  it('marks unknown commands as unknown', () => {
    const mention = resolveMentionFromComment('@opencode launch-rocket');
    expect(mention?.known).toBe(false);
  });

  it('builds a safe result for unknown commands', () => {
    const mention = resolveMentionFromComment('@opencode launch-rocket');
    expect(mention).not.toBeNull();
    const result = buildUnknownCommandResult(mention!);
    expect(result.status).toBe('skipped');
    expect(result.message).toContain('Unknown command: launch-rocket');
    expect(result.message).toContain('Known commands');
  });

  it('maps known commands to workflows', () => {
    expect(mapMentionToWorkflow('implement')).toBe('issue-to-pr');
    expect(mapMentionToWorkflow('apply-suggestion')).toBe('issue-to-pr');
    expect(mapMentionToWorkflow('review')).toBe('pr-review');
    expect(mapMentionToWorkflow('fix-tests')).toBe('ci-fix');
    expect(mapMentionToWorkflow('explain')).toBe('mention-command');
  });
});
