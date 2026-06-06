/**
 * Deterministic pasted-error debugging runtime.
 *
 * Classifies the pasted error, searches the workspace for the offending
 * symbol, reads the matched + likely files itself (no model read_file),
 * asks the provider for a fix file plan (JSON only, tools:[]), validates,
 * gets approval, applies via ToolRegistry, optionally runs the build, and
 * reports concisely. No raw model read_file/run_command/command_output.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type {ApeironCodeConfig} from '../config/config.js';
import type {EventBus} from '../core/events/bus.js';
import {createEventTimestamp} from '../core/events/events.js';
import type {ModelProvider} from '../providers/types.js';
import type {ApprovalManager} from '../safety/approvals.js';
import {ApprovalManager as ApprovalManagerImpl} from '../safety/approvals.js';
import type {SessionStore} from '../sessions/store.js';
import type {ToolExecutionContext} from '../tools/types.js';
import type {ToolRegistry} from '../tools/registry.js';
import {emitMessage} from './loopHelpers.js';
import type {PastedErrorInfo} from './errorPasteIntent.js';
import {readWorkspaceFiles} from './workspaceFileSnapshot.js';
import {buildFilePlanPrompt, parseFilePlanResponse, validateFilePlan} from './filePlanProtocol.js';
import {executeFilePlan, formatFilePlanExecutionSummary} from './filePlanExecutor.js';
import type {ConversationSession} from './session.js';
import type {AgentRunResult, AgentTaskState, ChatMessage} from './types.js';

const IGNORE_DIRS = new Set(['node_modules', 'dist', 'build', '.next', '.git', 'coverage', '.turbo']);
const TEXT_EXT = /\.(?:js|jsx|ts|tsx|css|scss|json|html|mjs|cjs|vue|svelte)$/u;
const MAX_SCAN_FILES = 600;
const MAX_MATCH_FILES = 8;

/** Deterministic workspace search for symbols/terms. No traversal, capped. */
export const searchWorkspace = async (
  cwd: string,
  terms: readonly string[],
): Promise<string[]> => {
  if (terms.length === 0) return [];
  const matches: string[] = [];
  let scanned = 0;
  const walk = async (dir: string): Promise<void> => {
    if (scanned >= MAX_SCAN_FILES || matches.length >= MAX_MATCH_FILES) return;
    const entries = await fs.readdir(dir, {withFileTypes: true}).catch(() => []);
    for (const entry of entries) {
      if (matches.length >= MAX_MATCH_FILES || scanned >= MAX_SCAN_FILES) return;
      if (entry.name.startsWith('.') && entry.name !== '.') {
        if (IGNORE_DIRS.has(entry.name)) continue;
      }
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        await walk(abs);
      } else if (TEXT_EXT.test(entry.name)) {
        scanned += 1;
        const content = await fs.readFile(abs, 'utf8').catch(() => null);
        if (content && terms.some((t) => content.includes(t))) {
          matches.push(path.relative(cwd, abs));
        }
      }
    }
  };
  await walk(cwd);
  return matches;
};

export interface ErrorFixParams {
  approvalManager: ApprovalManager;
  config: ApeironCodeConfig;
  cwd: string;
  eventBus: EventBus;
  error: PastedErrorInfo;
  model: string;
  prompt: string;
  provider: ModelProvider;
  session: ConversationSession;
  sessionStore: SessionStore;
  signal?: AbortSignal;
  taskState: AgentTaskState;
  toolRegistry: ToolRegistry;
  transcriptPath: string;
}

const streamText = async (
  provider: ModelProvider,
  model: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> => {
  let text = '';
  for await (const chunk of provider.stream({messages: [{content: prompt, role: 'user'}], model, signal, temperature: 0.2, tools: []})) {
    if (chunk.type === 'token') text += chunk.token ?? '';
  }
  return text;
};

const readPackageScripts = async (cwd: string): Promise<Record<string, string> | null> => {
  try {
    const raw = await fs.readFile(path.join(cwd, 'package.json'), 'utf8');
    return (JSON.parse(raw) as {scripts?: Record<string, string>}).scripts ?? {};
  } catch {
    return null;
  }
};

export const runErrorFix = async (params: ErrorFixParams): Promise<AgentRunResult> => {
  const {approvalManager, config, cwd, error, eventBus, model, prompt, provider, session, sessionStore, signal, taskState, toolRegistry, transcriptPath} = params;
  const userMessage: ChatMessage = {content: prompt, createdAt: new Date().toISOString(), id: crypto.randomUUID(), role: 'user'};
  session.messages.push(userMessage);
  emitMessage(eventBus, userMessage);
  eventBus.emit({message: `Debugging pasted ${error.errorType} error`, timestamp: createEventTimestamp(), type: 'status.updated'});

  const matched = await searchWorkspace(cwd, error.likelySearchTerms);
  if (matched.length > 0) {
    eventBus.emit({message: `Search ${error.symbol ?? error.likelySearchTerms[0] ?? 'symbol'} → ${matched.join(', ')}`, timestamp: createEventTimestamp(), type: 'status.updated'});
  }
  const candidates = Array.from(new Set([...matched, ...error.likelyFiles]));
  const entries = await readWorkspaceFiles(candidates, {cwd});
  const present = entries.filter((e) => e.exists);
  for (const e of present) {
    if (!taskState.filesRead.includes(e.path)) taskState.filesRead.push(e.path);
  }
  if (present.length > 0) {
    eventBus.emit({message: `Files inspected: ${present.map((e) => e.path).join(', ')}`, timestamp: createEventTimestamp(), type: 'status.updated'});
  }
  const snapshot = present.map((e) => `--- ${e.path} ---\n${e.content}`).join('\n\n');

  const planPrompt = [
    buildFilePlanPrompt(
      {kind: 'fix_bug', confidence: 1, reason: 'pasted error', requiresCommands: false, requiresFileWrites: true, requiresProvider: true, requiresWorkspaceInspection: true, safetyLevel: 'high', suggestedFiles: matched},
      snapshot,
      prompt,
    ),
    '',
    'Fix this pasted runtime/build error. Return a file plan (JSON only) with full corrected file contents:',
    error.message,
    error.symbol ? `Offending symbol: ${error.symbol}` : '',
  ].filter(Boolean).join('\n');

  const text = await streamText(provider, model, planPrompt, signal).catch(() => '');
  const parsed = parseFilePlanResponse(text);
  let body: string;
  const commandsRun: string[] = [];

  if (!parsed.ok || !validateFilePlan(parsed.plan, cwd).ok) {
    body = `I inspected ${present.map((e) => e.path).join(', ') || 'the workspace'} but could not produce a safe fix plan for: ${error.message}\nNo files were changed.`;
  } else {
    const execution = await executeFilePlan(parsed.plan, {approvalManager, config, cwd, eventBus, sessionId: session.id, signal, toolRegistry});
    for (const f of execution.filesChanged) {
      if (!taskState.filesChanged.includes(f)) taskState.filesChanged.push(f);
    }
    for (const tc of execution.toolCalls) session.toolCalls.push(tc);
    if (!execution.ok) {
      body = formatFilePlanExecutionSummary(execution);
    } else {
      let validation = '';
      const scripts = await readPackageScripts(cwd);
      // Always validate by running the build when a build script exists, not
      // just for build-time error classes. A "Cannot read properties of
      // undefined" patch can still introduce typos / missing imports that a
      // build run catches — and silent success is the failure mode we are
      // explicitly trying to eliminate.
      if (scripts?.build) {
        const buildCommand = 'npm run build';
        const approved = await approvalManager.request({
          details: 'Validate the fix by building the app.',
          kind: 'command',
          message: buildCommand,
          resource: buildCommand,
          riskLevel: 'medium',
          scope: 'project',
          title: 'Build to validate fix',
        });
        if (approved.approved) {
          const preapproved = new ApprovalManagerImpl('bypass');
          const toolContext: ToolExecutionContext = {approvalManager: preapproved, config, cwd, eventBus, preapprovedTools: ['run_command'], sessionId: session.id};
          const r = await toolRegistry.invoke('run_command', {command: buildCommand}, toolContext)
            .catch((e: unknown) => ({ok: false, output: e instanceof Error ? e.message : String(e), summary: 'run_command failed'}));
          commandsRun.push(buildCommand);
          session.toolCalls.push({createdAt: new Date().toISOString(), id: crypto.randomUUID(), input: {command: buildCommand}, status: r.ok ? 'success' : 'error', toolName: 'run_command'});
          validation = r.ok ? `\nValidation: \`${buildCommand}\` passed.` : `\nValidation: \`${buildCommand}\` still failing. Re-run to iterate.`;
        } else {
          validation = `\nValidation skipped (build not approved). Run \`${buildCommand}\` to verify.`;
        }
      }
      body = [
        `Fixed ${execution.filesChanged.join(', ')} for: ${error.message}`,
        `Files changed: ${execution.filesChanged.join(', ') || 'none'}`,
        commandsRun.length ? `Commands run: ${commandsRun.join(', ')}` : 'Commands run: none',
        validation.trim() || 'Validation: not run',
      ].join('\n');
    }
  }

  taskState.commandsRun = commandsRun;
  const finalMessage: ChatMessage = {content: body, createdAt: new Date().toISOString(), id: crypto.randomUUID(), role: 'assistant'};
  session.messages.push(finalMessage);
  session.transcriptPath = transcriptPath;
  session.updatedAt = new Date().toISOString();
  emitMessage(eventBus, finalMessage);
  await sessionStore.save(session).catch(() => undefined);
  return {finalMessage, messages: session.messages, taskState, toolCalls: session.toolCalls};
};
