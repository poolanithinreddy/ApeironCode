import type {GitHubClient} from '../connectors/github/client.js';
import {createBranch, getDefaultBranch} from '../connectors/github/branches.js';
import {createGitHubIssueComment, getGitHubIssue} from '../connectors/github/issues.js';
import {createGitHubPull} from '../connectors/github/pulls.js';
import {listPullRequestComments} from '../connectors/github/reviews.js';
import type {EventBus} from '../core/events/bus.js';
import {checkAutomationPermission, type PermissionDecision} from './permissions.js';
import {
  buildRunMarker,
  findExistingApeironCodePr,
  findExistingRunMarker,
  formatRunMarkerComment,
  type RunMarkerKey,
} from './idempotency.js';
import {buildCommentBody} from './summary.js';
import type {
  AutomationOptions,
  AutomationPermissionConfig,
  AutomationResult,
  AutomationStep,
} from './types.js';

export interface IssueToPrInput {
  actor?: string;
  branchName?: string;
  client: GitHubClient;
  config: AutomationPermissionConfig;
  eventBus?: EventBus;
  issueNumber: number;
  options?: AutomationOptions;
  repoFullName?: string;
  runAgent?: (context: {body?: string | null; issueNumber: number; title: string}) => Promise<{summary: string}>;
}

export const buildIssueBranchName = (issueNumber: number, title = ''): string => {
  const slug = title.toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 40);
  return `apeironcode/issue-${issueNumber}${slug ? `-${slug}` : ''}`;
};

const createAutomationBranch = async (
  client: GitHubClient,
  branchName: string,
  defaultBranch: string,
): Promise<string> => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = attempt === 0 ? branchName : `${branchName}-${attempt + 1}`;
    try {
      await createBranch(client, candidate, `heads/${defaultBranch}`);
      return candidate;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/422|already exists|reference already exists|exists/iu.test(message) || attempt === 2) {
        throw error;
      }
    }
  }
  return branchName;
};

const emit = (eventBus: EventBus | undefined, type: string, payload: Record<string, unknown>): void => {
  if (!eventBus) {
    return;
  }
  eventBus.emit({
    timestamp: new Date().toISOString(),
    type,
    ...payload,
  } as unknown as Parameters<EventBus['emit']>[0]);
};

const recordStep = (steps: AutomationStep[], step: AutomationStep, eventBus?: EventBus): void => {
  steps.push(step);
  emit(eventBus, 'github.automation_progress', {step});
};

export const runIssueToPrAutomation = async (input: IssueToPrInput): Promise<AutomationResult> => {
  const dryRun = input.options?.dryRun !== false;
  const steps: AutomationStep[] = [];
  emit(input.eventBus, 'github.automation_started', {workflow: 'issue-to-pr', issueNumber: input.issueNumber, dryRun});

  try {
    if (!input.client.configured) {
      throw new Error('GitHub client is not configured (missing GITHUB_TOKEN).');
    }

    recordStep(steps, {name: 'Fetch issue', status: 'running'}, input.eventBus);
    const issue = await getGitHubIssue(input.client, input.issueNumber);
    steps[steps.length - 1] = {detail: `#${issue.number} ${issue.title}`, name: 'Fetch issue', status: 'succeeded'};

    const markerKey: RunMarkerKey = {
      actor: input.actor,
      command: 'issue-to-pr',
      issueOrPrNumber: input.issueNumber,
      repo: input.repoFullName ?? 'unknown',
    };
    if (!dryRun) {
      const existingComments = await listPullRequestComments(input.client, input.issueNumber).catch(() => [] as Array<{body: string}>);
      const existingMarker = findExistingRunMarker(existingComments, markerKey);
      const existingPr = await findExistingApeironCodePr(input.client, markerKey, input.branchName).catch(() => null);
      if (existingMarker || existingPr) {
        recordStep(steps, {detail: 'duplicate command detected', name: 'Idempotency check', status: 'skipped'}, input.eventBus);
        const result: AutomationResult = {
          branchName: existingPr?.branch ?? input.branchName,
          dryRun: false,
          message: existingPr
            ? `Already handled: existing ApeironCode PR #${existingPr.number}.`
            : `Already handled: existing run marker ${existingMarker?.hash} from ${existingMarker?.timestamp}.`,
          prNumber: existingPr?.number,
          prUrl: existingPr?.htmlUrl,
          status: 'skipped',
          steps,
          workflow: 'issue-to-pr',
        };
        emit(input.eventBus, 'github.automation_completed', {workflow: 'issue-to-pr', dryRun: false, deduped: true});
        return result;
      }
    }

    let branchName = input.branchName ?? buildIssueBranchName(input.issueNumber, issue.title);
    const defaultBranch = await getDefaultBranch(input.client);

    const commitDecision = checkAutomationPermission('commit', input.config, input.options ?? {dryRun: true}, input.repoFullName);
    const prDecision = checkAutomationPermission('pr-create', input.config, input.options ?? {dryRun: true}, input.repoFullName);

    if (dryRun) {
      recordStep(steps, {detail: branchName, name: 'Plan branch', status: 'succeeded'}, input.eventBus);
      recordStep(steps, {detail: 'agent execution skipped in dry-run', name: 'Run agent', status: 'skipped'}, input.eventBus);
      recordStep(steps, {detail: `would commit on ${branchName}`, name: 'Commit changes', status: 'skipped'}, input.eventBus);
      recordStep(steps, {detail: `would open PR ${branchName} -> ${defaultBranch}`, name: 'Open pull request', status: 'skipped'}, input.eventBus);
      const result: AutomationResult = {
        branchName,
        dryRun: true,
        message: 'Issue-to-PR dry-run complete; no GitHub writes performed.',
        status: 'succeeded',
        steps,
        workflow: 'issue-to-pr',
      };
      emit(input.eventBus, 'github.automation_completed', {workflow: 'issue-to-pr', dryRun: true});
      return result;
    }

    requireAllowed(commitDecision, 'commit');
    requireAllowed(prDecision, 'pr-create');

    recordStep(steps, {detail: branchName, name: 'Create branch', status: 'running'}, input.eventBus);
    branchName = await createAutomationBranch(input.client, branchName, defaultBranch);
    steps[steps.length - 1] = {detail: branchName, name: 'Create branch', status: 'succeeded'};

    if (input.runAgent) {
      recordStep(steps, {name: 'Run agent', status: 'running'}, input.eventBus);
      const agentResult = await input.runAgent({body: issue.body, issueNumber: issue.number, title: issue.title});
      steps[steps.length - 1] = {detail: agentResult.summary.slice(0, 200), name: 'Run agent', status: 'succeeded'};
    } else {
      recordStep(steps, {detail: 'no agent runner provided', name: 'Run agent', status: 'skipped'}, input.eventBus);
    }

    recordStep(steps, {name: 'Open pull request', status: 'running'}, input.eventBus);
    const marker = buildRunMarker(markerKey);
    const markerComment = formatRunMarkerComment(marker);
    const pr = await createGitHubPull(input.client, {
      base: defaultBranch,
      body: `Closes #${issue.number}\n\n${issue.title}\n\n${markerComment}`,
      head: branchName,
      title: `ApeironCode: ${issue.title}`,
    });
    steps[steps.length - 1] = {detail: `#${pr.number}`, name: 'Open pull request', status: 'succeeded'};

    const result: AutomationResult = {
      branchName,
      dryRun: false,
      message: 'Issue-to-PR automation complete.',
      prNumber: pr.number,
      prUrl: pr.htmlUrl,
      status: 'succeeded',
      steps,
      workflow: 'issue-to-pr',
    };

    const commentDecision = checkAutomationPermission('comment', input.config, input.options ?? {dryRun: true}, input.repoFullName);
    if (commentDecision.allowed) {
      await createGitHubIssueComment(input.client, issue.number, `${buildCommentBody(result)}\n\n${markerComment}`);
    }

    emit(input.eventBus, 'github.automation_completed', {workflow: 'issue-to-pr', dryRun: false, prNumber: pr.number});
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emit(input.eventBus, 'github.automation_failed', {workflow: 'issue-to-pr', error: message});
    return {
      dryRun,
      message: `Issue-to-PR automation failed: ${message}`,
      status: 'failed',
      steps,
      workflow: 'issue-to-pr',
    };
  }
};

const requireAllowed = (decision: PermissionDecision, action: string): void => {
  if (!decision.allowed) {
    throw new Error(`Automation permission denied for ${action}: ${decision.reason}`);
  }
};
