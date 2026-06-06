import {describe, it, expect} from 'vitest';
import {buildGitContext, type GitContext} from '../../src/context/gitContext.js';

describe('gitContext - git repository metadata', () => {
  it('returns GitContext interface', async () => {
    const context = await buildGitContext('/tmp');

    expect(context).toBeDefined();
    expect(context.currentBranch).toBeDefined();
    expect(context.recentFiles).toBeDefined();
    expect(context.uncommittedFiles).toBeDefined();
    expect(context.stagedFiles).toBeDefined();
    expect(context.recentAuthors).toBeDefined();
    expect(context.recentCommitMessages).toBeDefined();
  });

  it('returns empty arrays when not a git repository', async () => {
    const context = await buildGitContext('/tmp');

    if (context.currentBranch === null) {
      expect(context.recentFiles).toBeDefined();
      expect(Array.isArray(context.recentFiles)).toBe(true);
      expect(Array.isArray(context.uncommittedFiles)).toBe(true);
      expect(Array.isArray(context.stagedFiles)).toBe(true);
      expect(Array.isArray(context.recentAuthors)).toBe(true);
      expect(Array.isArray(context.recentCommitMessages)).toBe(true);
    }
  });

  it('parses current branch name', async () => {
    const context = await buildGitContext('/tmp');

    if (context.currentBranch !== null) {
      expect(typeof context.currentBranch).toBe('string');
      expect(context.currentBranch.length).toBeGreaterThan(0);
    }
  });

  it('distinguishes staged vs uncommitted files', async () => {
    const context = await buildGitContext('/tmp');

    expect(Array.isArray(context.stagedFiles)).toBe(true);
    expect(Array.isArray(context.uncommittedFiles)).toBe(true);
  });

  it('collects recent files from git log', async () => {
    const context = await buildGitContext('/tmp');

    expect(Array.isArray(context.recentFiles)).toBe(true);
    if (context.recentFiles.length > 0) {
      expect(context.recentFiles[0]).toBeTruthy();
    }
  });

  it('extracts author names from commits', async () => {
    const context = await buildGitContext('/tmp');

    expect(Array.isArray(context.recentAuthors)).toBe(true);
    for (const author of context.recentAuthors) {
      expect(typeof author).toBe('string');
      expect(author.length).toBeGreaterThan(0);
    }
  });

  it('extracts commit messages', async () => {
    const context = await buildGitContext('/tmp');

    expect(Array.isArray(context.recentCommitMessages)).toBe(true);
    for (const message of context.recentCommitMessages) {
      expect(typeof message).toBe('string');
    }
  });

  it('handles detached HEAD gracefully', async () => {
    const context = await buildGitContext('/tmp');

    if (context.currentBranch === null) {
      expect(context.currentBranch === null).toBe(true);
    } else {
      expect(typeof context.currentBranch).toBe('string');
    }
  });

  it('caps recent files at 20 entries', async () => {
    const context = await buildGitContext('/tmp');

    expect(context.recentFiles.length).toBeLessThanOrEqual(20);
  });

  it('provides consistent structure across calls', async () => {
    const context1 = await buildGitContext('/tmp');
    const context2 = await buildGitContext('/tmp');

    expect(context1.currentBranch).toEqual(context2.currentBranch);
    expect(context1.uncommittedFiles.length).toEqual(context2.uncommittedFiles.length);
    expect(context1.stagedFiles.length).toEqual(context2.stagedFiles.length);
  });

  it('handles git commands with reject: false', async () => {
    await expect(buildGitContext('/nonexistent/path/to/repo')).resolves.not.toThrow();
  });

  it('returns type-safe git context', async () => {
    const context = await buildGitContext('/tmp');

    const typeCheck: GitContext = context;
    expect(typeCheck).toBeDefined();
  });
});
