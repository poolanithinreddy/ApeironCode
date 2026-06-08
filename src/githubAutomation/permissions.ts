import type {AutomationPermissionConfig, AutomationOptions} from './types.js';
import {DEFAULT_AUTOMATION_PERMISSIONS} from './types.js';

const ENV_FLAG = 'APEIRONCODE_AUTOMATION';
const LEGACY_ENV_FLAG = 'OPENCODE_AUTOMATION';

const pick = (
  env: Record<string, string | undefined>,
  primary: string,
  legacy: string,
): string | undefined => env[primary] ?? env[legacy];

export const loadAutomationPermissionsFromEnv = (
  env: Record<string, string | undefined> = process.env,
): AutomationPermissionConfig => {
  if (pick(env, ENV_FLAG, LEGACY_ENV_FLAG) !== '1') {
    return {...DEFAULT_AUTOMATION_PERMISSIONS};
  }
  const actors = pick(env, 'APEIRONCODE_AUTOMATION_ACTORS', 'OPENCODE_AUTOMATION_ACTORS');
  const repos = pick(env, 'APEIRONCODE_AUTOMATION_REPOS', 'OPENCODE_AUTOMATION_REPOS');
  const denyActors = pick(env, 'APEIRONCODE_AUTOMATION_DENY_ACTORS', 'OPENCODE_AUTOMATION_DENY_ACTORS');
  return {
    allowComment: pick(env, 'APEIRONCODE_AUTOMATION_COMMENT', 'OPENCODE_AUTOMATION_COMMENT') === '1',
    allowCommit: pick(env, 'APEIRONCODE_AUTOMATION_COMMIT', 'OPENCODE_AUTOMATION_COMMIT') === '1',
    allowPrCreate: pick(env, 'APEIRONCODE_AUTOMATION_PR_CREATE', 'OPENCODE_AUTOMATION_PR_CREATE') === '1',
    allowReview: pick(env, 'APEIRONCODE_AUTOMATION_REVIEW', 'OPENCODE_AUTOMATION_REVIEW') === '1',
    allowedActors: actors?.split(',').map((r) => r.trim()).filter(Boolean),
    allowedRepos: repos?.split(',').map((r) => r.trim()).filter(Boolean),
    deniedActors: denyActors?.split(',').map((r) => r.trim()).filter(Boolean),
  };
};

export interface PermissionDecision {
  allowed: boolean;
  mode?: AutomationMode;
  reason: string;
}

export type AutomationMode = 'dry-run' | 'comment-only' | 'branch-only' | 'pr-create' | 'review-submit' | 'ci-fix';

export interface AutomationPolicyInput {
  actor?: string;
  branchProtected?: boolean;
  desiredMode: AutomationMode;
  fork?: boolean;
  repoFullName?: string;
}

const repoAllowed = (config: AutomationPermissionConfig, repoFullName?: string): boolean => {
  if (!config.allowedRepos || config.allowedRepos.length === 0) {
    return true;
  }
  if (!repoFullName) {
    return false;
  }
  return config.allowedRepos.includes(repoFullName);
};

const actorAllowed = (config: AutomationPermissionConfig, actor?: string): boolean => {
  if (actor && config.deniedActors?.includes(actor)) {
    return false;
  }
  if (!config.allowedActors || config.allowedActors.length === 0) {
    return true;
  }
  return actor ? config.allowedActors.includes(actor) : false;
};

export const decideAutomationMode = (
  config: AutomationPermissionConfig,
  input: AutomationPolicyInput,
): PermissionDecision => {
  if (!repoAllowed(config, input.repoFullName)) {
    return {allowed: false, mode: 'dry-run', reason: `repository ${input.repoFullName ?? 'unknown'} not in allowed list`};
  }
  if (!actorAllowed(config, input.actor)) {
    return {allowed: false, mode: 'comment-only', reason: `actor ${input.actor ?? 'unknown'} is not allowed for write automation`};
  }
  if (input.fork) {
    return {allowed: input.desiredMode === 'dry-run' || input.desiredMode === 'comment-only', mode: 'comment-only', reason: 'fork pull request restricted to comment-only/dry-run'};
  }
  if (input.branchProtected && (input.desiredMode === 'branch-only' || input.desiredMode === 'ci-fix')) {
    return {allowed: false, mode: 'comment-only', reason: 'protected branch cannot be pushed directly'};
  }
  return {allowed: true, mode: input.desiredMode, reason: 'policy permits requested automation mode'};
};

export const checkAutomationPermission = (
  action: 'comment' | 'commit' | 'pr-create' | 'review',
  config: AutomationPermissionConfig,
  options: AutomationOptions,
  repoFullName?: string,
): PermissionDecision => {
  if (options.dryRun !== false) {
    return {allowed: true, reason: 'dry-run mode'};
  }
  if (!repoAllowed(config, repoFullName)) {
    return {allowed: false, reason: `repository ${repoFullName ?? 'unknown'} not in allowed list`};
  }
  switch (action) {
    case 'comment':
      return config.allowComment
        ? {allowed: true, reason: 'APEIRONCODE_AUTOMATION_COMMENT=1'}
        : {allowed: false, reason: 'set APEIRONCODE_AUTOMATION=1 and APEIRONCODE_AUTOMATION_COMMENT=1 to allow comments'};
    case 'commit':
      return config.allowCommit
        ? {allowed: true, reason: 'APEIRONCODE_AUTOMATION_COMMIT=1'}
        : {allowed: false, reason: 'set APEIRONCODE_AUTOMATION=1 and APEIRONCODE_AUTOMATION_COMMIT=1 to allow commits'};
    case 'pr-create':
      return config.allowPrCreate
        ? {allowed: true, reason: 'APEIRONCODE_AUTOMATION_PR_CREATE=1'}
        : {allowed: false, reason: 'set APEIRONCODE_AUTOMATION=1 and APEIRONCODE_AUTOMATION_PR_CREATE=1 to allow PR creation'};
    case 'review':
      return config.allowReview
        ? {allowed: true, reason: 'APEIRONCODE_AUTOMATION_REVIEW=1'}
        : {allowed: false, reason: 'set APEIRONCODE_AUTOMATION=1 and APEIRONCODE_AUTOMATION_REVIEW=1 to allow review submission'};
  }
};
