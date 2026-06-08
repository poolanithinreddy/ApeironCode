/**
 * Deterministic "run this app" handling.
 *
 * Instead of letting the model emit malformed read_file/run_command calls,
 * the runtime locates the app directory (fuzzy-matching a hint like "todo" to
 * "todo-list"), reads package.json deterministically, and proposes the correct
 * command (or `open index.html` for static apps) with approval.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type {ApeironCodeConfig} from '../config/config.js';
import type {EventBus} from '../core/events/bus.js';
import {createEventTimestamp} from '../core/events/events.js';
import type {ModelProvider} from '../providers/types.js';
import type {ApprovalManager} from '../safety/approvals.js';
import type {SessionStore} from '../sessions/store.js';
import type {ToolExecutionContext} from '../tools/types.js';
import type {ToolRegistry} from '../tools/registry.js';
import {ApprovalManager as ApprovalManagerImpl} from '../safety/approvals.js';
import {buildFilePlanPrompt, parseFilePlanResponse, validateFilePlan} from './filePlanProtocol.js';
import {executeFilePlan} from './filePlanExecutor.js';
import {buildWorkspaceSnapshotForIntent} from './workspaceFileSnapshot.js';
import {findAppDirectories, resolveAppDirByHint, type AppDirectory} from './appWorkspaceDetection.js';
import {emitMessage} from './loopHelpers.js';
import type {ConversationSession} from './session.js';
import type {AgentRunResult, AgentTaskState, ChatMessage} from './types.js';

// Must mention an app-ish target — "run the command" / "run npm test" must
// NOT be treated as run-app.
const RUN_APP_RE =
  /\b(?:run|start|launch|serve|preview)\b[^.?!]*\b(?:app|application|web\s*app|site|website|project|dev\s*server|server|todo[\w-]*)\b/iu;

// "build/create/modify" intents must not be hijacked by run-app.
const BUILD_OR_MODIFY_RE =
  /\b(build|create|scaffold|generate|implement|add|make\s+(?:the\s+)?ui|premium|refactor|fix|edit|modify|improve)\b/iu;

// "run the application and fix any errors" / "build the app" / "fix errors":
// a deterministic build-then-fix flow, NOT a fresh scaffold.
// Build-fix requires an explicit run/build verb (so a pure UI "fix errors"
// modify request is NOT hijacked here — it goes to modify_existing_app).
const BUILD_FIX_RE =
  /\b(?:(?:run|start|launch)\b[^.?!]*\bfix\b|build\s+(?:the\s+)?(?:app|application|project|it)\b|run\s+(?:the\s+)?build\b|compile\s+(?:the\s+)?(?:app|project)\b|npm\s+run\s+build)\b/iu;
const FRESH_SCAFFOLD_RE =
  /\b(?:create|scaffold|generate|make)\b[^.?!]*\b(?:new\s+)?(?:app|application|project|website|site)\b/iu;

export type AppActionMode = 'run' | 'build-fix';

export const detectAppActionRequest = (prompt: string): AppActionMode | null => {
  const text = prompt.trim();
  if (FRESH_SCAFFOLD_RE.test(text)) return null;
  if (BUILD_FIX_RE.test(text)) return 'build-fix';
  if (BUILD_OR_MODIFY_RE.test(text)) return null;
  return RUN_APP_RE.test(text) ? 'run' : null;
};

/** Back-compat boolean used by existing call sites/tests. */
export const detectRunAppRequest = (prompt: string): boolean =>
  detectAppActionRequest(prompt) !== null;

/** Extract a directory hint token from the prompt (e.g. "todo" → todo-list). */
const extractHint = (prompt: string): string | undefined => {
  const m = prompt
    .toLowerCase()
    .match(/\b(?:run|start|launch|serve|preview|cd)\s+(?:this\s+|the\s+|my\s+)?([a-z0-9][\w-]*)/u);
  const stop = new Set(['this', 'the', 'app', 'it', 'my', 'todo']);
  if (m?.[1] && !stop.has(m[1])) return m[1];
  // fall back to any app-ish noun
  const n = prompt.toLowerCase().match(/\b(todo|calculator|notes?|dashboard|blog|shop)\b/u);
  return n?.[1];
};

const readPackageScripts = async (
  cwd: string,
  dir: string,
): Promise<Record<string, string> | null> => {
  try {
    const raw = await fs.readFile(path.join(cwd, dir, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as {scripts?: Record<string, string>};
    return parsed.scripts ?? {};
  } catch {
    return null;
  }
};

const proposeCommand = (
  dir: string,
  scripts: Record<string, string> | null,
): string | null => {
  if (!scripts) return null;
  const prefix = dir ? `cd ${dir} && ` : '';
  if (scripts.dev) return `${prefix}npm run dev`;
  if (scripts.start) return `${prefix}npm start`;
  if (scripts.serve) return `${prefix}npm run serve`;
  return null;
};

export interface RunAppParams {
  approvalManager: ApprovalManager;
  config: ApeironCodeConfig;
  cwd: string;
  eventBus: EventBus;
  prompt: string;
  session: ConversationSession;
  sessionStore: SessionStore;
  taskState: AgentTaskState;
  toolRegistry: ToolRegistry;
  transcriptPath: string;
  mode?: AppActionMode;
  provider?: ModelProvider;
  model?: string;
  signal?: AbortSignal;
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

const runBuildFix = async (
  params: RunAppParams,
  target: AppDirectory,
  where: string,
): Promise<{body: string; commandsRun: string[]}> => {
  const {approvalManager, config, cwd, eventBus, prompt, session, toolRegistry, provider, model, signal} = params;
  const scripts = await readPackageScripts(cwd, target.dir);
  const prefix = target.dir ? `cd ${target.dir} && ` : '';
  if (!scripts?.build) {
    return {body: `No \`build\` script found in ${where}. Cannot build. Add a build script or run the dev server instead.`, commandsRun: []};
  }
  const buildCommand = `${prefix}npm run build`;
  const devCommand = scripts.dev ? `${prefix}npm run dev` : scripts.start ? `${prefix}npm start` : null;
  const commandsRun: string[] = [];

  const runBuild = async (): Promise<{ok: boolean; output: string}> => {
    const approved = await approvalManager.request({
      details: `Build the app in ${where}.`,
      kind: 'command',
      message: buildCommand,
      resource: buildCommand,
      riskLevel: 'medium',
      scope: 'project',
      title: 'Build app command',
    });
    if (!approved.approved) return {ok: false, output: '__denied__'};
    const preapproved = new ApprovalManagerImpl('bypass');
    const toolContext: ToolExecutionContext = {
      approvalManager: preapproved,
      config,
      cwd,
      eventBus,
      preapprovedTools: ['run_command'],
      sessionId: session.id,
    };
    const result = await toolRegistry.invoke('run_command', {command: buildCommand}, toolContext)
      .catch((error: unknown) => ({ok: false, output: error instanceof Error ? error.message : String(error), summary: 'run_command failed'}));
    commandsRun.push(buildCommand);
    session.toolCalls.push({
      createdAt: new Date().toISOString(),
      id: crypto.randomUUID(),
      input: {command: buildCommand},
      status: result.ok ? 'success' : 'error',
      toolName: 'run_command',
    });
    return {ok: result.ok, output: result.output || result.summary};
  };

  let attempt = 0;
  let last = await runBuild();
  if (last.output === '__denied__') {
    return {body: `I did not build the app because approval was denied.\nTo build manually: \`${buildCommand}\``, commandsRun};
  }
  while (!last.ok && attempt < 2 && provider && model) {
    attempt += 1;
    const snap = await buildWorkspaceSnapshotForIntent({suggestedFiles: []}, cwd);
    const fixPrompt = [
      buildFilePlanPrompt(
        {kind: 'modify_existing_app', confidence: 1, reason: 'build fix', requiresCommands: false, requiresFileWrites: true, requiresProvider: true, requiresWorkspaceInspection: true, safetyLevel: 'high', suggestedFiles: []},
        snap.snapshot,
        prompt,
      ),
      '',
      'The build failed. Fix the errors. Build output:',
      last.output.slice(0, 4_000),
    ].join('\n');
    const text = await streamText(provider, model, fixPrompt, signal).catch(() => '');
    const parsed = parseFilePlanResponse(text);
    if (!parsed.ok || !validateFilePlan(parsed.plan, cwd).ok) break;
    const exec = await executeFilePlan(parsed.plan, {
      approvalManager,
      config,
      cwd,
      eventBus,
      sessionId: session.id,
      signal,
      toolRegistry,
    });
    if (!exec.ok) break;
    last = await runBuild();
    if (last.output === '__denied__') break;
  }

  if (last.ok) {
    const runHint = devCommand ? `\nTo run it: \`${devCommand}\`` : '';
    return {body: `Build passed in ${where}: \`${buildCommand}\`.${runHint}`, commandsRun};
  }
  return {
    body: `Build still failing in ${where} after ${attempt} fix attempt(s). I did not claim success.\nLast build output:\n${last.output.slice(0, 800)}`,
    commandsRun,
  };
};

export const runRunApp = async (params: RunAppParams): Promise<AgentRunResult> => {
  const {approvalManager, config, cwd, eventBus, prompt, session, sessionStore, taskState, toolRegistry, transcriptPath} = params;
  const userMessage: ChatMessage = {
    content: prompt,
    createdAt: new Date().toISOString(),
    id: crypto.randomUUID(),
    role: 'user',
  };
  session.messages.push(userMessage);
  emitMessage(eventBus, userMessage);

  const dirs = await findAppDirectories(cwd);
  let body: string;
  const commandsRun: string[] = [];

  if (dirs.length === 0) {
    body = 'No runnable app was found (no index.html or package.json in the workspace).';
  } else {
    const hint = extractHint(prompt);
    const target: AppDirectory = resolveAppDirByHint(dirs, hint) ?? dirs[0]!;
    const where = target.dir ? `\`${target.dir}/\`` : 'the workspace root';

    if (target.hasPackageJson && params.mode === 'build-fix') {
      const buildFix = await runBuildFix(params, target, where);
      body = buildFix.body;
      commandsRun.push(...buildFix.commandsRun);
    } else if (target.hasPackageJson) {
      const scripts = await readPackageScripts(cwd, target.dir);
      const command = proposeCommand(target.dir, scripts);
      const partialNote = target.partialApp
        ? '\nNote: this looks like an existing/partial framework app (package.json + pages/styles). Continuing with the existing app rather than re-scaffolding.'
        : '';
      if (!command) {
        body = `Found a package app in ${where} but no dev/start/serve script. Inspect package.json and add one.${partialNote}`;
      } else {
        eventBus.emit({
          message: `Proposed run command: ${command}`,
          timestamp: createEventTimestamp(),
          type: 'status.updated',
        });
        const approved = await approvalManager.request({
          details: `Run the app in ${where}.${partialNote}`,
          kind: 'command',
          message: command,
          resource: command,
          riskLevel: 'medium',
          scope: 'project',
          title: 'Run app command',
        });
        if (!approved.approved) {
          body = `I did not run the app because approval was denied.\nTo run it manually: \`${command}\`${partialNote}`;
        } else {
          const preapproved = new ApprovalManagerImpl('bypass');
          const toolContext: ToolExecutionContext = {
            approvalManager: preapproved,
            config,
            cwd,
            eventBus,
            preapprovedTools: ['run_command'],
            sessionId: session.id,
          };
          const result = await toolRegistry.invoke(
            'run_command',
            {command, background: true},
            toolContext,
          ).catch((error: unknown) => ({
            ok: false,
            output: error instanceof Error ? error.message : String(error),
            summary: 'run_command failed',
          }));
          commandsRun.push(command);
          session.toolCalls.push({
            createdAt: new Date().toISOString(),
            id: crypto.randomUUID(),
            input: {command},
            status: result.ok ? 'success' : 'error',
            toolName: 'run_command',
          });
          body = result.ok
            ? `Started the app in ${where}: \`${command}\`.${partialNote}`
            : `Could not start the app: ${result.summary}\nTo run it manually: \`${command}\`${partialNote}`;
        }
      }
    } else {
      const open = target.dir ? `open ${target.dir}/index.html` : 'open index.html';
      body = `This is a static app in ${where}. Open it with:\n\`${open}\``;
    }
  }

  taskState.commandsRun = commandsRun;
  const finalMessage: ChatMessage = {
    content: body,
    createdAt: new Date().toISOString(),
    id: crypto.randomUUID(),
    role: 'assistant',
  };
  session.messages.push(finalMessage);
  session.transcriptPath = transcriptPath;
  session.updatedAt = new Date().toISOString();
  emitMessage(eventBus, finalMessage);
  await sessionStore.save(session).catch(() => undefined);
  return {finalMessage, messages: session.messages, taskState, toolCalls: session.toolCalls};
};
