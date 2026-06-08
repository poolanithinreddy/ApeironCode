import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {finalizeTaskState} from '../core/agent/state.js';
import type {EventBus} from '../core/events/bus.js';
import {createEventTimestamp} from '../core/events/events.js';
import type {ModelProvider, ProviderUsage} from '../providers/types.js';
import type {ApprovalManager} from '../safety/approvals.js';
import type {ApeironCodeConfig} from '../config/config.js';
import type {ToolRegistry} from '../tools/registry.js';
import {classifyCodingIntent} from './codingIntent.js';
import {hasWorkspaceAppFiles} from './appWorkspaceDetection.js';
import {buildWorkspaceSnapshotForIntent} from './workspaceFileSnapshot.js';
import {buildFilePlanPrompt, parseFilePlanResponse, validateFilePlan} from './filePlanProtocol.js';
import {executeFilePlan, formatFilePlanExecutionSummary} from './filePlanExecutor.js';
import {
  buildAcceptanceCorrectionDirective,
  detectAppKind,
  evaluateImplementedFeatures,
  extractFeatureRequirements,
  formatFeatureAcceptanceReport,
} from './featureAcceptance.js';
import {
  buildBrowserSmokeCorrection,
  runBrowserSmoke,
  wantsRenderedSmoke,
} from './browserSmokeRuntime.js';
import type {AgentRunResult, AgentTaskState, ChatMessage, ToolCallRecord} from './types.js';

export interface CodingTaskContext {
  approvalManager: ApprovalManager;
  config: ApeironCodeConfig;
  cwd: string;
  eventBus?: EventBus;
  initialMessages?: ChatMessage[];
  model: string;
  provider: ModelProvider;
  sessionId?: string;
  signal?: AbortSignal;
  taskState?: AgentTaskState;
  toolRegistry: ToolRegistry;
}

const msg = (role: ChatMessage['role'], content: string): ChatMessage => ({
  content,
  createdAt: new Date().toISOString(),
  id: crypto.randomUUID(),
  role,
});

const streamText = async (
  provider: ModelProvider,
  model: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<{text: string; usage?: ProviderUsage}> => {
  let text = '';
  let usage: ProviderUsage | undefined;
  for await (const chunk of provider.stream({
    messages: [{content: prompt, role: 'user'}],
    model,
    signal,
    temperature: 0.2,
    tools: [],
  })) {
    if (chunk.type === 'token') text += chunk.token ?? '';
    if (chunk.type === 'done') usage = chunk.usage;
  }
  return {text, usage};
};

const listWorkspace = async (cwd: string): Promise<string[]> => {
  const output: string[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 2 || output.length > 80) return;
    for (const entry of await fs.readdir(dir, {withFileTypes: true}).catch(() => [])) {
      if (entry.name.startsWith('.git') || entry.name === 'node_modules' || entry.name === 'dist') continue;
      const absolute = path.join(dir, entry.name);
      const relative = path.relative(cwd, absolute);
      output.push(entry.isDirectory() ? `${relative}/` : relative);
      if (entry.isDirectory()) await walk(absolute, depth + 1);
    }
  };
  await walk(cwd, 0);
  return output;
};

const readRelevantFiles = async (
  cwd: string,
  intentFiles: string[],
): Promise<{snapshot: string; inspected: string[]}> => {
  const {snapshot, inspected} = await buildWorkspaceSnapshotForIntent(
    {suggestedFiles: intentFiles},
    cwd,
    intentFiles,
  );
  return {snapshot, inspected};
};

export async function runCodingTask(
  prompt: string,
  context: CodingTaskContext,
): Promise<AgentRunResult> {
  const messages = [...(context.initialMessages ?? [])];
  const userMessage = msg('user', prompt);
  messages.push(userMessage);
  context.eventBus?.emit({message: userMessage, timestamp: createEventTimestamp(), type: 'message.completed'});

  const intent = classifyCodingIntent(prompt, '', {
    workspaceHasAppFiles: await hasWorkspaceAppFiles(context.cwd),
  });
  context.eventBus?.emit({
    message: `Coding intent: ${intent.kind}`,
    timestamp: createEventTimestamp(),
    type: 'status.updated',
  });

  const workspaceFiles = await listWorkspace(context.cwd);
  const inspection = intent.requiresWorkspaceInspection
    ? await readRelevantFiles(context.cwd, intent.suggestedFiles)
    : {snapshot: '', inspected: [] as string[]};
  if (inspection.inspected.length > 0) {
    context.eventBus?.emit({
      message: `Files inspected: ${inspection.inspected.join(', ')}`,
      timestamp: createEventTimestamp(),
      type: 'status.updated',
    });
    if (context.taskState) {
      for (const file of inspection.inspected) {
        if (!context.taskState.filesRead.includes(file)) context.taskState.filesRead.push(file);
      }
    }
  }
  const workspaceSnapshot = [
    `Files:\n${workspaceFiles.length ? workspaceFiles.join('\n') : '(empty)'}`,
    inspection.snapshot,
  ].filter(Boolean).join('\n\n');

  if (intent.kind === 'build_full_stack_app') {
    const planPrompt = [
      'Create a concise phased full-stack build plan. Return prose, not files.',
      `User request: ${prompt}`,
      `Workspace:\n${workspaceSnapshot}`,
      'Include stack, folders, data/auth/API/client, phases, commands, and the first task.',
    ].join('\n');
    const {text, usage} = await streamText(context.provider, context.model, planPrompt, context.signal);
    const finalMessage = msg('assistant', [
      text.trim() || 'I created a full-stack build plan, but no files were changed.',
      '',
      'No files were written. Approve starting phase 1 to generate files.',
    ].join('\n'));
    messages.push(finalMessage);
    if (context.taskState) finalizeTaskState(context.taskState, finalMessage.content);
    return {finalMessage, messages, taskState: context.taskState, toolCalls: [], usage};
  }

  const planPrompt = buildFilePlanPrompt(intent, workspaceSnapshot, prompt);
  const first = await streamText(context.provider, context.model, planPrompt, context.signal);
  let usage = first.usage;
  let parsed = parseFilePlanResponse(first.text);
  if (!parsed.ok) {
    // Ask exactly once for corrected strict JSON before failing cleanly.
    const correctionPrompt = [
      'Your previous response was not valid file-plan JSON.',
      `Parse error: ${parsed.error}`,
      'Return ONLY the JSON object. No prose, no markdown fences, no tool calls.',
      '',
      planPrompt,
    ].join('\n');
    const retry = await streamText(context.provider, context.model, correctionPrompt, context.signal);
    const retryParsed = parseFilePlanResponse(retry.text);
    if (retryParsed.ok) {
      parsed = retryParsed;
      usage = retry.usage ?? usage;
    }
  }
  if (!parsed.ok) {
    const finalMessage = msg('assistant', `I could not use the generated file plan safely: ${parsed.error}\nNo files were changed.`);
    messages.push(finalMessage);
    if (context.taskState) {
      context.taskState.errors.push(parsed.error);
      finalizeTaskState(context.taskState, finalMessage.content);
    }
    return {finalMessage, messages, taskState: context.taskState, toolCalls: [], usage};
  }

  const validation = validateFilePlan(parsed.plan, context.cwd, {
    allowDelete: intent.kind === 'delete_file',
  });
  if (!validation.ok) {
    const finalMessage = msg('assistant', `I rejected the generated file plan: ${validation.errors.join('; ')}\nNo files were changed.`);
    messages.push(finalMessage);
    if (context.taskState) {
      context.taskState.errors.push(...validation.errors);
      finalizeTaskState(context.taskState, finalMessage.content);
    }
    return {finalMessage, messages, taskState: context.taskState, toolCalls: [], usage};
  }

  const execution = await executeFilePlan(parsed.plan, context);
  const toolCalls: ToolCallRecord[] = [...execution.toolCalls];

  if (!execution.ok && execution.errors.length > 0 && execution.filesChanged.length > 0) {
    const fixPrompt = [
      'The previous file plan partially failed. Generate a minimal fix file plan as JSON.',
      `Original request: ${prompt}`,
      `Failure: ${execution.errors.join('\n')}`,
      `Workspace:\n${(await readRelevantFiles(context.cwd, parsed.plan.files.map((file) => file.path))).snapshot}`,
    ].join('\n');
    const fix = await streamText(context.provider, context.model, fixPrompt, context.signal).catch(() => null);
    if (fix) {
      const fixParsed = parseFilePlanResponse(fix.text);
      if (fixParsed.ok && validateFilePlan(fixParsed.plan, context.cwd).ok) {
        const fixExecution = await executeFilePlan(fixParsed.plan, context);
        toolCalls.push(...fixExecution.toolCalls);
        execution.filesChanged.push(...fixExecution.filesChanged.filter((file) => !execution.filesChanged.includes(file)));
        execution.commandsRun.push(...fixExecution.commandsRun);
        execution.errors = fixExecution.ok ? [] : fixExecution.errors;
        execution.ok = fixExecution.ok;
        execution.summary = fixExecution.ok ? 'Applied file plan and follow-up fix plan.' : execution.summary;
      }
    }
  }

  // Feature acceptance loop: "files written" is not success. Verify the app
  // actually contains the requested features; if not, ask the provider for a
  // correction plan listing the exact missing features (max 2 iterations).
  let acceptanceReport: string | undefined;
  const appKind = detectAppKind(prompt);
  // Only run the correction loop for concrete app kinds with reliable,
  // checkable feature sets (todo/calculator). Generic build/modify prompts
  // (e.g. "make it premium/dark") have subjective acceptance and must not
  // force an extra provider round.
  const acceptanceApplies =
    execution.ok &&
    execution.filesChanged.length > 0 &&
    appKind !== 'generic';
  if (acceptanceApplies) {
    const {requirements} = extractFeatureRequirements(prompt, {appKind});
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const snap = await buildWorkspaceSnapshotForIntent(
        {suggestedFiles: execution.filesChanged},
        context.cwd,
        execution.filesChanged,
      );
      const report = evaluateImplementedFeatures(requirements, snap.snapshot);
      acceptanceReport = formatFeatureAcceptanceReport(report);
      if (report.ok) break;
      const correctionPrompt = [
        buildFilePlanPrompt(intent, snap.snapshot, prompt),
        '',
        buildAcceptanceCorrectionDirective(report),
      ].join('\n');
      const correction = await streamText(context.provider, context.model, correctionPrompt, context.signal).catch(() => null);
      if (!correction) break;
      const correctionParsed = parseFilePlanResponse(correction.text);
      if (!correctionParsed.ok || !validateFilePlan(correctionParsed.plan, context.cwd).ok) break;
      const correctionExec = await executeFilePlan(correctionParsed.plan, context);
      usage = correction.usage ?? usage;
      toolCalls.push(...correctionExec.toolCalls);
      for (const file of correctionExec.filesChanged) {
        if (!execution.filesChanged.includes(file)) execution.filesChanged.push(file);
      }
      execution.commandsRun.push(...correctionExec.commandsRun);
      if (!correctionExec.ok) break;
    }
  }

  // Browser / rendered-UI smoke (Phase 18A, Task B/D). Feature acceptance only
  // proves features exist in the snapshot; this loads the *actual* entry HTML +
  // only its linked CSS/JS and applies DOM/CSS heuristics so we never claim a
  // premium UI passed when the display can overflow, the wrong file was edited,
  // or a linked asset is missing. Report-only by design: it adds no provider or
  // tool calls (so it never destabilizes deterministic multi-turn flows), and
  // when it fails it appends an honest "Browser smoke: failed" + a concrete
  // correction directive the user/model can act on.
  let browserSmokeReport: string | undefined;
  const smokeApplies = execution.ok && execution.filesChanged.length > 0 && wantsRenderedSmoke(prompt);
  if (smokeApplies) {
    const smoke = await runBrowserSmoke({
      changedFiles: execution.filesChanged,
      cwd: context.cwd,
      prompt,
      selectedFiles: intent.suggestedFiles,
    });
    if (smoke.applicable && smoke.summary) {
      const directive = smoke.ok ? null : buildBrowserSmokeCorrection(smoke);
      browserSmokeReport = directive ? `${smoke.summary}\n${directive}` : smoke.summary;
    }
  }

  if (context.taskState) {
    for (const file of execution.filesChanged) {
      if (!context.taskState.filesChanged.includes(file)) context.taskState.filesChanged.push(file);
    }
    for (const command of execution.commandsRun) {
      if (!context.taskState.commandsRun.includes(command)) context.taskState.commandsRun.push(command);
    }
    context.taskState.errors.push(...execution.errors);
  }
  const summaryParts = [formatFilePlanExecutionSummary(execution)];
  if (acceptanceReport) summaryParts.push(acceptanceReport);
  if (browserSmokeReport) summaryParts.push(browserSmokeReport);
  const finalMessage = msg('assistant', summaryParts.join('\n'));
  messages.push(finalMessage);
  if (context.taskState) finalizeTaskState(context.taskState, finalMessage.content);
  return {finalMessage, messages, taskState: context.taskState, toolCalls, usage};
}
