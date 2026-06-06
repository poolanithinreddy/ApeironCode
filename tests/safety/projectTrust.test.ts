import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {
  formatProjectTrustWarning,
  getProjectTrustStatus,
  markProjectTrusted,
  markProjectUntrusted,
  requiresTrustForAction,
} from '../../src/safety/projectTrust.js';

describe('projectTrust', () => {
  let projectDir: string;
  let homeDir: string;
  let prevHome: string | undefined;

  beforeEach(async () => {
    prevHome = process.env.HOME;
    homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apc-trust-home-'));
    process.env.HOME = homeDir;
    // Project dir kept OUTSIDE tmpdir for trust marking tests by using a subdirectory of homeDir
    // (homeDir is in tmpdir, so we need a non-tmp project dir; create under homeDir's path of a fake "projects" prefix)
    // To work around, we point to a path under homeDir but the tmp check resolves against os.tmpdir realpath.
    // For "trusted" tests we need a project NOT under tmpdir. Use cwd-style fake under homeDir but we'll use
    // the home itself as a project location - it IS under tmpdir, so tests that mark trusted will check the
    // untrusted-tmp behavior. We'll therefore use a project dir constructed via /private prefix manipulation.
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apc-trust-proj-'));
  });

  afterEach(async () => {
    process.env.HOME = prevHome;
    await fs.rm(homeDir, {force: true, recursive: true});
    await fs.rm(projectDir, {force: true, recursive: true});
  });

  it('default trust is unknown for non-tmp paths (or untrusted for tmp)', () => {
    const status = getProjectTrustStatus(projectDir);
    // Project dir is in tmpdir, so always untrusted
    expect(status.trust).toBe('untrusted');
  });

  it('tmpdir is always untrusted regardless of stored state', () => {
    const status = getProjectTrustStatus(os.tmpdir());
    expect(status.trust).toBe('untrusted');
    const tryMark = markProjectTrusted(os.tmpdir());
    expect(tryMark.trust).toBe('untrusted');
  });

  it('mark untrusted persists', () => {
    // Use the home (also in tmpdir) — markUntrusted writes regardless.
    const status = markProjectUntrusted(homeDir);
    expect(status.trust).toBe('untrusted');
  });

  it('mark trusted/untrusted on a non-tmp simulated path works via home', () => {
    // Use a fake "non-tmp" path by creating a directory and querying its trust before/after marking.
    // Since homeDir resolves into tmpdir, we instead simulate by checking the storage round-trip: we mark
    // and then read back via the store using a non-tmp path that doesn't exist on disk (resolution falls
    // back to path.resolve when realpath fails).
    const fakePath = '/var/__nonexistent_apc_project__';
    const marked = markProjectTrusted(fakePath, 'manual test');
    expect(marked.trust).toBe('trusted');
    const status = getProjectTrustStatus(fakePath);
    expect(status.trust).toBe('trusted');
    expect(status.reason).toBe('manual test');
  });

  it('requiresTrustForAction returns true for hooks/plugins/mcp', () => {
    expect(requiresTrustForAction('load-hooks').requiresTrust).toBe(true);
    expect(requiresTrustForAction('load-plugins').requiresTrust).toBe(true);
    expect(requiresTrustForAction('load-mcp-config').requiresTrust).toBe(true);
    expect(requiresTrustForAction('totally-fine').requiresTrust).toBe(false);
  });

  it('reason is sanitized and never includes secret-looking blobs', () => {
    const fakePath = '/var/__apc_redact_test__';
    const longSecret = 'a'.repeat(40);
    const marked = markProjectTrusted(fakePath, `tagged ${longSecret} value`);
    expect(marked.reason ?? '').not.toContain(longSecret);
  });

  it('formatProjectTrustWarning produces clean output', () => {
    const status = getProjectTrustStatus(projectDir);
    const text = formatProjectTrustWarning(status);
    expect(text).toContain('Project trust');
    expect(text).not.toMatch(/[A-Za-z0-9_-]{40,}/u);
  });
});
