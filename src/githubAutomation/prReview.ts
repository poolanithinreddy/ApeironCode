import type {GitHubClient} from '../connectors/github/client.js';
import {getGitHubPull, listGitHubPullFiles} from '../connectors/github/pulls.js';
import {commentOnPullRequest, createPullRequestReview, listPullRequestComments, type GitHubReviewComment} from '../connectors/github/reviews.js';
import type {EventBus} from '../core/events/bus.js';
import {checkAutomationPermission} from './permissions.js';
import {
  buildRunMarker,
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

const MAX_INLINE_COMMENTS = 20;

const normalizeReviewComment = (comment: GitHubReviewComment): GitHubReviewComment | null => {
  if (!comment.path || !comment.body.trim()) {
    return null;
  }
  const severity = /blocking|must|regression|breaks/iu.test(comment.body)
    ? 'blocking'
    : /nit\b/iu.test(comment.body)
      ? 'nit'
      : /\?/u.test(comment.body)
        ? 'question'
        : 'suggestion';
  return {...comment, body: `[${severity}] ${comment.body}`};
};

export const prepareInlineReviewComments = (
  comments: GitHubReviewComment[],
  existingBodies: string[] = [],
): {fallbackSummary: string[]; inline: GitHubReviewComment[]} => {
  const seen = new Set(existingBodies.map((body) => body.trim()));
  const inline: GitHubReviewComment[] = [];
  const fallbackSummary: string[] = [];
  for (const raw of comments) {
    const comment = normalizeReviewComment(raw);
    if (!comment || seen.has(comment.body.trim())) {
      continue;
    }
    seen.add(comment.body.trim());
    if (comment.position === undefined && comment.line === undefined) {
      fallbackSummary.push(`${comment.path}: ${comment.body}`);
      continue;
    }
    if (inline.length < MAX_INLINE_COMMENTS) {
      inline.push(comment);
    } else {
      fallbackSummary.push(`${comment.path}: ${comment.body}`);
    }
  }
  return {fallbackSummary, inline};
};

export interface PrReviewInput {
  actor?: string;
  client: GitHubClient;
  config: AutomationPermissionConfig;
  eventBus?: EventBus;
  options?: AutomationOptions;
  prNumber: number;
  repoFullName?: string;
  runAgent?: (context: {filesChanged: number; prNumber: number; title: string}) => Promise<{
    comments?: GitHubReviewComment[];
    summary: string;
  }>;
}

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

export const runPrReviewAutomation = async (input: PrReviewInput): Promise<AutomationResult> => {
  const dryRun = input.options?.dryRun !== false;
  const steps: AutomationStep[] = [];
  emit(input.eventBus, 'github.automation_started', {workflow: 'pr-review', prNumber: input.prNumber, dryRun});

  try {
    if (!input.client.configured) {
      throw new Error('GitHub client is not configured (missing GITHUB_TOKEN).');
    }

    recordStep(steps, {name: 'Fetch PR', status: 'running'}, input.eventBus);
    const pull = await getGitHubPull(input.client, input.prNumber);
    steps[steps.length - 1] = {detail: `#${pull.number} ${pull.title}`, name: 'Fetch PR', status: 'succeeded'};

    recordStep(steps, {name: 'Fetch changed files', status: 'running'}, input.eventBus);
    const files = await listGitHubPullFiles(input.client, input.prNumber);
    steps[steps.length - 1] = {detail: `${files.length} file(s)`, name: 'Fetch changed files', status: 'succeeded'};

    let summary = 'No agent runner provided; review notes unavailable.';
    let comments: GitHubReviewComment[] = [];
    if (input.runAgent) {
      recordStep(steps, {name: 'Run agent (review mode)', status: 'running'}, input.eventBus);
      const agentResult = await input.runAgent({filesChanged: files.length, prNumber: pull.number, title: pull.title});
      summary = agentResult.summary;
      comments = agentResult.comments ?? [];
      steps[steps.length - 1] = {
        detail: `${comments.length} inline comment(s)`,
        name: 'Run agent (review mode)',
        status: 'succeeded',
      };
    } else {
      recordStep(steps, {detail: 'no agent runner provided', name: 'Run agent (review mode)', status: 'skipped'}, input.eventBus);
    }

    if (dryRun) {
      recordStep(steps, {detail: 'review submission skipped', name: 'Submit review', status: 'skipped'}, input.eventBus);
      const prepared = prepareInlineReviewComments(comments);
      const result: AutomationResult = {
        dryRun: true,
        message: `PR review dry-run complete.\n\n${summary}\n\nInline comments planned: ${prepared.inline.length}${prepared.fallbackSummary.length > 0 ? `\nFallback summary:\n${prepared.fallbackSummary.join('\n')}` : ''}`,
        status: 'succeeded',
        steps,
        workflow: 'pr-review',
      };
      emit(input.eventBus, 'github.automation_completed', {workflow: 'pr-review', dryRun: true});
      return result;
    }

    const reviewDecision = checkAutomationPermission('review', input.config, input.options ?? {dryRun: true}, input.repoFullName);
    if (!reviewDecision.allowed) {
      throw new Error(`Automation permission denied: ${reviewDecision.reason}`);
    }

    const markerKey: RunMarkerKey = {
      actor: input.actor,
      command: 'pr-review',
      issueOrPrNumber: input.prNumber,
      ref: pull.head,
      repo: input.repoFullName ?? 'unknown',
    };
    const existing = await listPullRequestComments(input.client, pull.number).catch(() => []);
    if (findExistingRunMarker(existing, markerKey)) {
      recordStep(steps, {detail: 'duplicate review skipped', name: 'Idempotency check', status: 'skipped'}, input.eventBus);
      const result: AutomationResult = {
        dryRun: false,
        message: `Already handled: existing ApeironCode review marker for PR #${pull.number}.`,
        status: 'skipped',
        steps,
        workflow: 'pr-review',
      };
      emit(input.eventBus, 'github.automation_completed', {workflow: 'pr-review', dryRun: false, deduped: true});
      return result;
    }

    recordStep(steps, {name: 'Submit review', status: 'running'}, input.eventBus);
    const prepared = prepareInlineReviewComments(comments, existing.map((comment) => comment.body));
    const reviewSummary = prepared.fallbackSummary.length > 0
      ? `${summary}\n\nInline fallback notes:\n${prepared.fallbackSummary.join('\n')}`
      : summary;
    await createPullRequestReview(input.client, pull.number, prepared.inline, reviewSummary, 'COMMENT');
    steps[steps.length - 1] = {detail: 'review submitted', name: 'Submit review', status: 'succeeded'};

    const result: AutomationResult = {
      dryRun: false,
      message: 'PR review automation complete.',
      status: 'succeeded',
      steps,
      workflow: 'pr-review',
    };

    const commentDecision = checkAutomationPermission('comment', input.config, input.options ?? {dryRun: true}, input.repoFullName);
    if (commentDecision.allowed) {
      const marker = buildRunMarker(markerKey);
      await commentOnPullRequest(input.client, pull.number, `${buildCommentBody(result)}\n\n${formatRunMarkerComment(marker)}`);
    }

    emit(input.eventBus, 'github.automation_completed', {workflow: 'pr-review', dryRun: false});
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emit(input.eventBus, 'github.automation_failed', {workflow: 'pr-review', error: message});
    return {
      dryRun,
      message: `PR review automation failed: ${message}`,
      status: 'failed',
      steps,
      workflow: 'pr-review',
    };
  }
};
