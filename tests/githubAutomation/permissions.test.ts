import {describe, it, expect} from 'vitest';
import {
  checkAutomationPermission,
  decideAutomationMode,
  loadAutomationPermissionsFromEnv,
} from '../../src/githubAutomation/permissions.js';

describe('automation permissions', () => {
  it('defaults to all-deny when env flag not set', () => {
    const config = loadAutomationPermissionsFromEnv({});
    expect(config.allowComment).toBe(false);
    expect(config.allowCommit).toBe(false);
    expect(config.allowPrCreate).toBe(false);
    expect(config.allowReview).toBe(false);
  });

  it('honours per-action env flags when automation enabled', () => {
    const config = loadAutomationPermissionsFromEnv({
      OPENCODE_AUTOMATION: '1',
      OPENCODE_AUTOMATION_COMMENT: '1',
      OPENCODE_AUTOMATION_REVIEW: '1',
    });
    expect(config.allowComment).toBe(true);
    expect(config.allowReview).toBe(true);
    expect(config.allowCommit).toBe(false);
    expect(config.allowPrCreate).toBe(false);
  });

  it('parses allowed repos from comma list', () => {
    const config = loadAutomationPermissionsFromEnv({
      OPENCODE_AUTOMATION: '1',
      OPENCODE_AUTOMATION_REPOS: 'org/repo-a, org/repo-b',
    });
    expect(config.allowedRepos).toEqual(['org/repo-a', 'org/repo-b']);
  });

  it('always allows actions in dry-run mode', () => {
    const config = loadAutomationPermissionsFromEnv({});
    const decision = checkAutomationPermission('commit', config, {dryRun: true});
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toContain('dry-run');
  });

  it('denies real writes by default', () => {
    const config = loadAutomationPermissionsFromEnv({});
    const decision = checkAutomationPermission('pr-create', config, {dryRun: false});
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('APEIRONCODE_AUTOMATION');
  });

  it('honours allowed repository allowlist', () => {
    const config = loadAutomationPermissionsFromEnv({
      OPENCODE_AUTOMATION: '1',
      OPENCODE_AUTOMATION_COMMIT: '1',
      OPENCODE_AUTOMATION_REPOS: 'org/repo-a',
    });
    const allowed = checkAutomationPermission('commit', config, {dryRun: false}, 'org/repo-a');
    const blocked = checkAutomationPermission('commit', config, {dryRun: false}, 'org/repo-b');
    expect(allowed.allowed).toBe(true);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain('not in allowed list');
  });

  it('restricts fork PRs and protected branches to safe modes', () => {
    const config = loadAutomationPermissionsFromEnv({
      OPENCODE_AUTOMATION: '1',
      OPENCODE_AUTOMATION_ACTORS: 'octocat',
      OPENCODE_AUTOMATION_COMMIT: '1',
      OPENCODE_AUTOMATION_PR_CREATE: '1',
    });
    expect(decideAutomationMode(config, {
      actor: 'octocat',
      desiredMode: 'ci-fix',
      fork: true,
      repoFullName: 'org/repo',
    }).mode).toBe('comment-only');
    const protectedBranch = decideAutomationMode(config, {
      actor: 'octocat',
      branchProtected: true,
      desiredMode: 'ci-fix',
      repoFullName: 'org/repo',
    });
    expect(protectedBranch.allowed).toBe(false);
    expect(protectedBranch.reason).toContain('protected branch');
  });

  it('denies unknown or explicitly blocked actors for write automation', () => {
    const config = loadAutomationPermissionsFromEnv({
      OPENCODE_AUTOMATION: '1',
      OPENCODE_AUTOMATION_ACTORS: 'maintainer',
      OPENCODE_AUTOMATION_DENY_ACTORS: 'blocked',
    });
    expect(decideAutomationMode(config, {actor: 'stranger', desiredMode: 'pr-create'}).allowed).toBe(false);
    expect(decideAutomationMode(config, {actor: 'blocked', desiredMode: 'pr-create'}).allowed).toBe(false);
  });
});
