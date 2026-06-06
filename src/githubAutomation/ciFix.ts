import type {GitHubClient} from '../connectors/github/client.js';
import {formatFailedCheckSummary, listCheckRunAnnotations, listFailedCheckRuns} from '../connectors/github/checks.js';
import {fetchWorkflowJobLogText, listGitHubActionsJobs, listGitHubActionsRuns, listWorkflowRunArtifacts} from '../connectors/github/actions.js';
import {getGitHubPull} from '../connectors/github/pulls.js';
import {commentOnPullRequest} from '../connectors/github/reviews.js';
import type {EventBus} from '../core/events/bus.js';
import {checkAutomationPermission} from './permissions.js';
import {buildCommentBody} from './summary.js';
import {formatParsedFailure, parseCiFailureLog} from './ciLogParser.js';
import {
  buildPatchCommitMessage,
  buildSafeFailureComment,
  DEFAULT_PATCH_LIMITS,
  enforcePatchLimits,
  measurePatch,
  retryWithBackoff,
} from './patchOrchestrator.js';
import {compressToolOutput} from '../tools/outputCompressor.js';
import type {
  AutomationOptions,
  AutomationPermissionConfig,
  AutomationResult,
  AutomationStep,
} from './types.js';

export interface CiFixInput {
  client: GitHubClient;
  config: AutomationPermissionConfig;
  eventBus?: EventBus;
  maxChangedFiles?: number;
  maxDiffBytes?: number;
  options?: AutomationOptions;
  prNumber?: number;
  ref?: string;
  repoFullName?: string;
  runAgent?: (context: {failedChecks: number; ref: string; summary: string}) => Promise<{
    diff?: string;
    filesChanged?: string[];
    patched: number;
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

export const runCiFixAutomation = async (input: CiFixInput): Promise<AutomationResult> => {
  const dryRun = input.options?.dryRun !== false;
  const steps: AutomationStep[] = [];
  emit(input.eventBus, 'github.automation_started', {workflow: 'ci-fix', prNumber: input.prNumber, ref: input.ref, dryRun});

  try {
    if (!input.client.configured) {
      throw new Error('GitHub client is not configured (missing GITHUB_TOKEN).');
    }

    let resolvedRef = input.ref;
    if (!resolvedRef && input.prNumber !== undefined) {
      recordStep(steps, {name: 'Fetch PR head ref', status: 'running'}, input.eventBus);
      const pull = await getGitHubPull(input.client, input.prNumber);
      resolvedRef = pull.head ?? '';
      steps[steps.length - 1] = {detail: resolvedRef, name: 'Fetch PR head ref', status: 'succeeded'};
    }
    if (!resolvedRef) {
      throw new Error('CI fix automation requires either a PR number or an explicit ref.');
    }

    recordStep(steps, {name: 'Fetch failed check runs', status: 'running'}, input.eventBus);
    const failed = await listFailedCheckRuns(input.client, resolvedRef);
    const annotationBlocks: string[] = [];
    for (const run of failed) {
      const annotations = await listCheckRunAnnotations(input.client, run.id).catch(() => []);
      if (annotations.length > 0) {
        annotationBlocks.push([
          `Annotations for ${run.name}:`,
          ...annotations.slice(0, 20).map((annotation) => [
            annotation.path && annotation.startLine ? `${annotation.path}:${annotation.startLine}` : annotation.path,
            annotation.title,
            annotation.message,
            annotation.rawDetails,
          ].filter(Boolean).join(' — ')),
        ].join('\n'));
      }
    }
    const jobLogs: string[] = [];
    const artifactSummaries: string[] = [];
    try {
      const runs = await listGitHubActionsRuns(input.client);
      const recent = runs.slice(0, 3);
      for (const run of recent) {
        const jobs = await listGitHubActionsJobs(input.client, run.id).catch(() => []);
        for (const job of jobs) {
          if (job.conclusion !== 'failure') continue;
          const logText = await fetchWorkflowJobLogText(input.client, job.id);
          if (logText) {
            const parsed = parseCiFailureLog(logText);
            jobLogs.push([`Job ${job.name} (${job.conclusion}):`, formatParsedFailure(parsed)].join('\n'));
          }
        }
        const artifacts = await listWorkflowRunArtifacts(input.client, run.id);
        if (artifacts.length > 0) {
          artifactSummaries.push(`Run ${run.id} artifacts: ${artifacts.map((a) => `${a.name} (${a.archiveSizeBytes ?? 0}b)`).join(', ')}`);
        }
      }
    } catch {
      // Workflow log fetching is best-effort; failures should not block ci-fix.
    }

    const failureSummary = compressToolOutput(
      'github-ci-log',
      [formatFailedCheckSummary(failed), ...annotationBlocks, ...jobLogs, ...artifactSummaries].join('\n\n'),
      {maxTokens: 2_500, preserveErrors: true, preserveFailingTests: true, preserveStackTraces: true},
    ).content;
    steps[steps.length - 1] = {detail: `${failed.length} failing, ${jobLogs.length} job log(s)`, name: 'Fetch failed check runs', status: 'succeeded'};

    if (failed.length === 0) {
      const result: AutomationResult = {
        dryRun,
        message: 'No failing checks detected — nothing to fix.',
        status: 'succeeded',
        steps,
        workflow: 'ci-fix',
      };
      emit(input.eventBus, 'github.automation_completed', {workflow: 'ci-fix', dryRun, noop: true});
      return result;
    }

    let agentSummary = failureSummary;
    let patched = 0;
    let agentDiff = '';
    let agentFiles: string[] = [];
    if (input.runAgent) {
      recordStep(steps, {name: 'Run agent (test-fix mode)', status: 'running'}, input.eventBus);
      const agentResult = await input.runAgent({failedChecks: failed.length, ref: resolvedRef, summary: failureSummary});
      agentSummary = agentResult.summary;
      patched = agentResult.patched;
      agentDiff = agentResult.diff ?? '';
      agentFiles = agentResult.filesChanged ?? [];
      steps[steps.length - 1] = {detail: `${patched} file(s) patched`, name: 'Run agent (test-fix mode)', status: 'succeeded'};
    } else {
      recordStep(steps, {detail: 'no agent runner provided', name: 'Run agent (test-fix mode)', status: 'skipped'}, input.eventBus);
    }

    if (agentDiff) {
      const summary = measurePatch(agentFiles, agentDiff);
      const limit = enforcePatchLimits(summary, {
        maxChangedFiles: input.maxChangedFiles ?? DEFAULT_PATCH_LIMITS.maxChangedFiles,
        maxDiffBytes: input.maxDiffBytes ?? DEFAULT_PATCH_LIMITS.maxDiffBytes,
      });
      if (!limit.ok) {
        recordStep(steps, {detail: limit.reason, name: 'Patch limits', status: 'failed'}, input.eventBus);
        if (!dryRun && input.prNumber !== undefined) {
          const commentDecision = checkAutomationPermission('comment', input.config, input.options ?? {dryRun: true}, input.repoFullName);
          if (commentDecision.allowed) {
            await commentOnPullRequest(input.client, input.prNumber, buildSafeFailureComment({reason: limit.reason, workflow: 'ci-fix'})).catch(() => undefined);
          }
        }
        return {
          dryRun,
          message: `CI fix aborted: ${limit.reason}`,
          status: 'failed',
          steps,
          workflow: 'ci-fix',
        };
      }
      recordStep(steps, {detail: `${summary.files} files / ${summary.bytes} bytes`, name: 'Patch limits', status: 'succeeded'}, input.eventBus);
    }

    if (dryRun) {
      recordStep(steps, {detail: 'commit skipped', name: 'Commit fix to PR branch', status: 'skipped'}, input.eventBus);
      const result: AutomationResult = {
        dryRun: true,
        message: `CI fix dry-run.\n\n${agentSummary}`,
        status: 'succeeded',
        steps,
        workflow: 'ci-fix',
      };
      emit(input.eventBus, 'github.automation_completed', {workflow: 'ci-fix', dryRun: true});
      return result;
    }

    const commitDecision = checkAutomationPermission('commit', input.config, input.options ?? {dryRun: true}, input.repoFullName);
    if (!commitDecision.allowed) {
      throw new Error(`Automation permission denied: ${commitDecision.reason}`);
    }

    const result: AutomationResult = {
      dryRun: false,
      message: 'CI fix automation complete.',
      status: 'succeeded',
      steps,
      workflow: 'ci-fix',
    };

    if (input.prNumber !== undefined) {
      const commentDecision = checkAutomationPermission('comment', input.config, input.options ?? {dryRun: true}, input.repoFullName);
      if (commentDecision.allowed) {
        const commitNote = buildPatchCommitMessage({issueOrPrNumber: input.prNumber, ref: 'pr', summary: agentSummary, workflow: 'ci-fix'});
        await retryWithBackoff(() => commentOnPullRequest(input.client, input.prNumber!, `${buildCommentBody(result)}\n\n<details><summary>commit context</summary>\n\n${commitNote}\n</details>`), {sleep: () => Promise.resolve()});
      }
    }

    emit(input.eventBus, 'github.automation_completed', {workflow: 'ci-fix', dryRun: false});
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emit(input.eventBus, 'github.automation_failed', {workflow: 'ci-fix', error: message});
    return {
      dryRun,
      message: `CI fix automation failed: ${message}`,
      status: 'failed',
      steps,
      workflow: 'ci-fix',
    };
  }
};
