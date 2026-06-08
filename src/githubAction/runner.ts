import {GitHubClient} from '../connectors/github/client.js';
import {detectGitHubRepo, parseGitHubRemote} from '../connectors/github/repos.js';
import type {AutomationOptions, AutomationResult} from '../githubAutomation/types.js';
import {runIssueToPrAutomation} from '../githubAutomation/issueToPr.js';
import {runPrReviewAutomation} from '../githubAutomation/prReview.js';
import {runCiFixAutomation} from '../githubAutomation/ciFix.js';
import {
  buildUnknownCommandResult,
  mapMentionToWorkflow,
  resolveMentionFromComment,
} from '../githubAutomation/commentCommands.js';
import {decideAutomationMode, loadAutomationPermissionsFromEnv, type AutomationMode} from '../githubAutomation/permissions.js';
import type {GitHubActionEvent} from './events.js';
import type {ActionConfig, ActionMode} from './config.js';

export interface RunActionInput {
  config: ActionConfig;
  cwd?: string;
  env?: Record<string, string | undefined>;
  event: GitHubActionEvent;
}

const buildAutomationOptions = (config: ActionConfig): AutomationOptions => ({
  dryRun: config.dryRun,
  maxIterations: config.maxIterations,
  runTests: config.runTests,
});

const RUN_MARKER = '<!-- apeironcode-automation-run -->';
const LEGACY_RUN_MARKER = '<!-- opencode-automation-run -->';

export const buildActionRunMarker = (): string => RUN_MARKER;

const resolveMode = (event: GitHubActionEvent, configMode: ActionMode): ActionMode => {
  if (configMode !== 'auto') {
    return configMode;
  }
  if (event.context.eventType === 'issue_comment') {
    return 'mention';
  }
  if (event.context.eventType === 'pull_request_review_comment') {
    return 'mention';
  }
  if (event.context.eventType === 'pull_request') {
    return 'pr-review';
  }
  if (event.context.eventType === 'check_suite' || event.context.eventType === 'workflow_run') {
    return 'ci-fix';
  }
  return 'mention';
};

const buildClient = async (cwd: string, env: Record<string, string | undefined>): Promise<{client: GitHubClient; repoFullName?: string}> => {
  const repoFullName = env.GITHUB_REPOSITORY;
  let repo = repoFullName ? parseGitHubRemote(`https://github.com/${repoFullName}.git`) : null;
  if (!repo) {
    repo = await detectGitHubRepo(cwd);
  }
  if (!repo) {
    throw new Error('Cannot determine GitHub repository (set GITHUB_REPOSITORY or run inside a git checkout).');
  }
  return {
    client: new GitHubClient({env, repo}),
    repoFullName: `${repo.owner}/${repo.name}`,
  };
};

export const runActionFromEvent = async (input: RunActionInput): Promise<AutomationResult> => {
  const env = input.env ?? process.env;
  const cwd = input.cwd ?? process.cwd();
  const mode = resolveMode(input.event, input.config.mode);
  const automationOptions = buildAutomationOptions(input.config);
  const permissions = loadAutomationPermissionsFromEnv(env);
  if (
    input.event.context.commentBody?.includes(RUN_MARKER) ||
    input.event.context.commentBody?.includes(LEGACY_RUN_MARKER)
  ) {
    return {
      dryRun: true,
      message: 'Duplicate ApeironCode automation marker found; skipping replayed event.',
      status: 'skipped',
      steps: [{name: 'Idempotency check', status: 'skipped', detail: 'Existing run marker found.'}],
      workflow: 'mention-command',
    };
  }
  if (input.event.context.fork || input.event.context.protectedBranch) {
    automationOptions.dryRun = true;
  }

  const {client, repoFullName} = await buildClient(cwd, env);
  const desiredMode = modeToPolicyMode(mode);
  const policy = decideAutomationMode(permissions, {
    actor: input.event.context.senderLogin,
    branchProtected: input.event.context.protectedBranch,
    desiredMode,
    fork: input.event.context.fork,
    repoFullName,
  });
  if (!policy.allowed && desiredMode !== 'dry-run') {
    automationOptions.dryRun = true;
  }

  if (mode === 'issue-to-pr') {
    const issueNumber = input.event.context.issueNumber ?? input.event.context.prNumber;
    if (issueNumber === undefined) {
      return failure('issue-to-pr', 'No issue number found in event payload.');
    }
    return runIssueToPrAutomation({
      client,
      config: permissions,
      issueNumber,
      options: automationOptions,
      repoFullName,
    });
  }

  if (mode === 'pr-review') {
    const prNumber = input.event.context.prNumber;
    if (prNumber === undefined) {
      return failure('pr-review', 'No PR number found in event payload.');
    }
    return runPrReviewAutomation({
      client,
      config: permissions,
      options: automationOptions,
      prNumber,
      repoFullName,
    });
  }

  if (mode === 'ci-fix') {
    const ref = input.event.context.ref;
    const prNumber = input.event.context.prNumber;
    return runCiFixAutomation({
      client,
      config: permissions,
      options: automationOptions,
      prNumber,
      ref,
      repoFullName,
    });
  }

  // mention
  const mention = resolveMentionFromComment(input.event.context.commentBody);
  if (!mention) {
    return failure('mention-command', 'No @apeironcode mention found in comment.');
  }
  if (!mention.known) {
    return buildUnknownCommandResult(mention);
  }
  const targetWorkflow = mapMentionToWorkflow(mention.command);
  if (targetWorkflow === 'issue-to-pr' && input.event.context.issueNumber !== undefined) {
    return runIssueToPrAutomation({
      client,
      config: permissions,
      issueNumber: input.event.context.issueNumber,
      options: automationOptions,
      repoFullName,
    });
  }
  if (targetWorkflow === 'pr-review' && input.event.context.prNumber !== undefined) {
    return runPrReviewAutomation({
      client,
      config: permissions,
      options: automationOptions,
      prNumber: input.event.context.prNumber,
      repoFullName,
    });
  }
  if (targetWorkflow === 'ci-fix') {
    return runCiFixAutomation({
      client,
      config: permissions,
      options: automationOptions,
      prNumber: input.event.context.prNumber,
      ref: input.event.context.ref,
      repoFullName,
    });
  }
  return failure('mention-command', `Cannot route command "${mention.command}" given event context.`);
};

const modeToPolicyMode = (mode: ActionMode): AutomationMode => {
  if (mode === 'issue-to-pr') {
    return 'pr-create';
  }
  if (mode === 'pr-review') {
    return 'review-submit';
  }
  if (mode === 'ci-fix') {
    return 'ci-fix';
  }
  return 'comment-only';
};

const failure = (workflow: AutomationResult['workflow'], message: string): AutomationResult => ({
  dryRun: true,
  message,
  status: 'failed',
  steps: [{name: 'Resolve action context', status: 'failed', detail: message}],
  workflow,
});
