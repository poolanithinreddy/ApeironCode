/**
 * Provider-free deterministic Simple Action Executor.
 *
 * Executes obvious filesystem/command requests directly through the
 * ToolRegistry (or an approval-gated safe file op) with fully deterministic,
 * valid inputs — no provider call, no model tool-arg construction, no project
 * context build, no memory injection. Mutating actions still require approval.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import type {ApeironCodeConfig} from '../config/config.js';
import type {EventBus} from '../core/events/bus.js';
import {assessPath} from '../safety/pathGuard.js';
import {ApprovalManager} from '../safety/approvals.js';
import type {ToolRegistry} from '../tools/registry.js';
import type {SimpleAction} from './simpleActionRouter.js';
import {createStaticWebAppFiles} from './staticWebAppTemplates.js';

export interface SimpleActionExecutionContext {
  approvalManager: ApprovalManager;
  config: ApeironCodeConfig;
  cwd: string;
  eventBus?: EventBus;
  sessionId?: string;
}

export interface SimpleActionExecutionResult {
  ok: boolean;
  /** Concise one-line user-facing summary. */
  summary: string;
  filesChanged: string[];
  commandsRun: string[];
  /** Always 0 — direct execution never calls a provider. */
  providerCalls: 0;
  /** Detail/output for read/tree actions. */
  output?: string;
  unsupportedReason?: string;
  /** ToolRegistry tools actually executed (for session/history accuracy). */
  tools: Array<{toolName: string; ok: boolean; input: Record<string, unknown>}>;
}

// Phase 17E: read_file is now direct-executable too. A bare "read package.json"
// has no reasoning component the model can add — it must result in a
// deterministic read_file({path}) call. Leaving it on the model loop just
// invited "read_file requires path" failures when the model emitted the
// call malformed. The original concern was that reading is usually part of
// a larger task; if so, the prompt is compound and the prior compound-prompt
// guard already keeps it off this path.
const DIRECT_KINDS = new Set<SimpleAction['kind']>([
  'create_file',
  'static_web_app',
  'rename_file',
  'delete_file',
  'create_folder',
  'project_tree',
  'list_files',
  'read_file',
  'run_command',
  'run_tests',
]);

/** True when the action can be executed deterministically with no model. */
export const canExecuteSimpleActionDirectly = (action: SimpleAction): boolean =>
  DIRECT_KINDS.has(action.kind);

const fsExists = async (target: string): Promise<boolean> => {
  try {
    await fs.stat(target);
    return true;
  } catch {
    return false;
  }
};

const fail = (summary: string, unsupportedReason?: string): SimpleActionExecutionResult => ({
  ok: false,
  summary,
  filesChanged: [],
  commandsRun: [],
  providerCalls: 0,
  unsupportedReason,
  tools: [],
});

// Convention: created files start empty unless the user specifies content.
const DEFAULT_FILE_CONTENT = '';

export const executeSimpleAction = async (
  action: SimpleAction,
  context: SimpleActionExecutionContext,
  toolRegistry: ToolRegistry,
): Promise<SimpleActionExecutionResult> => {
  const execContext = {
    approvalManager: context.approvalManager,
    config: context.config,
    cwd: context.cwd,
    eventBus: context.eventBus,
    sessionId: context.sessionId,
  };

  // The registry executor throws (e.g. APPROVAL_DENIED) instead of returning
  // a result. Normalize to {ok,summary} so a denied approval is a clean
  // outcome, never an unhandled error.
  const tools: SimpleActionExecutionResult['tools'] = [];
  const invoke = async (
    tool: string,
    input: Record<string, unknown>,
  ): Promise<{ok: boolean; summary: string; output?: string}> => {
    try {
      const r = await toolRegistry.invoke(tool, input, execContext);
      tools.push({toolName: tool, ok: r.ok, input});
      return {ok: r.ok, summary: r.summary, output: r.output};
    } catch (error) {
      tools.push({toolName: tool, ok: false, input});
      const message = error instanceof Error ? error.message : String(error);
      return {ok: false, summary: message};
    }
  };

  switch (action.kind) {
    case 'create_file': {
      if (!action.path) return fail('No file path was specified.');
      const assessment = assessPath(context.cwd, action.path);
      if (assessment.outsideProject) {
        return fail(`Refused: ${action.path} is outside the workspace.`, 'path-outside-workspace');
      }
      if (await fsExists(assessment.resolvedPath)) {
        return fail(
          `${action.path} already exists. I did not overwrite it — ask explicitly to overwrite.`,
          'target-exists',
        );
      }
      const result = await invoke('write_file', {path: action.path, content: DEFAULT_FILE_CONTENT});
      if (!result.ok) {
        return fail(`Could not create ${action.path}: ${result.summary}`);
      }
      return {
        ok: true,
        summary: `Created ${action.path} in the project root.`,
        filesChanged: [action.path],
        commandsRun: [],
        providerCalls: 0,
        tools,
      };
    }

    case 'static_web_app': {
      const files = createStaticWebAppFiles({theme: action.theme});
      const existing: string[] = [];
      for (const file of files) {
        const assessment = assessPath(context.cwd, file.path);
        if (assessment.outsideProject) {
          return fail(`Refused: ${file.path} is outside the workspace.`, 'path-outside-workspace');
        }
        if (await fsExists(assessment.resolvedPath)) existing.push(file.path);
      }
      if (existing.length > 0) {
        return fail(
          `${existing.join(', ')} already ${existing.length === 1 ? 'exists' : 'exist'}. I did not overwrite existing files — ask explicitly to overwrite.`,
          'target-exists',
        );
      }
      const approved = await context.approvalManager.request({
        details: 'Risk: medium\nReason: This creates files in the workspace.',
        kind: 'write',
        message: 'Target: index.html, styles.css, app.js',
        resource: files.map((file) => file.path).join(', '),
        riskLevel: 'medium',
        scope: 'project',
        title: 'Create static web app',
      });
      if (!approved.approved) {
        return fail('I did not create the static web app because approval was denied.');
      }

      const preapprovedApproval = new ApprovalManager('bypass');
      const writeContext = {...execContext, approvalManager: preapprovedApproval, preapprovedTools: ['write_file']};
      for (const file of files) {
        const result = await toolRegistry.invoke('write_file', {path: file.path, content: file.content}, writeContext);
        tools.push({toolName: 'write_file', ok: result.ok, input: {path: file.path, content: file.content}});
        if (!result.ok) return fail(`Could not create ${file.path}: ${result.summary}`);
      }
      return {
        ok: true,
        summary: 'Created a static web app:\n- index.html\n- styles.css\n- app.js\n\nOpen it with:\n`open index.html`',
        filesChanged: files.map((file) => file.path),
        commandsRun: [],
        providerCalls: 0,
        tools,
      };
    }

    case 'create_folder': {
      if (!action.path) return fail('No folder path was specified.');
      const assessment = assessPath(context.cwd, action.path);
      if (assessment.outsideProject) {
        return fail(`Refused: ${action.path} is outside the workspace.`, 'path-outside-workspace');
      }
      if (await fsExists(assessment.resolvedPath)) {
        return fail(`${action.path} already exists.`, 'target-exists');
      }
      const approved = await context.approvalManager.request({
        kind: 'write',
        scope: 'project',
        title: 'Create folder',
        message: `Create directory ${action.path}?`,
        riskLevel: 'low',
        resource: action.path,
      });
      if (!approved.approved) {
        return fail(`I did not create ${action.path} because approval was denied.`);
      }
      await fs.mkdir(assessment.resolvedPath, {recursive: true});
      tools.push({toolName: 'create_folder', ok: true, input: {path: action.path}});
      return {
        ok: true,
        summary: `Created folder ${action.path}.`,
        filesChanged: [action.path],
        commandsRun: [],
        providerCalls: 0,
        tools,
      };
    }

    case 'rename_file': {
      if (!action.path || !action.toPath) return fail('Rename needs a source and destination.');
      const from = assessPath(context.cwd, action.path);
      const to = assessPath(context.cwd, action.toPath);
      if (from.outsideProject || to.outsideProject) {
        return fail('Refused: rename path is outside the workspace.', 'path-outside-workspace');
      }
      if (!(await fsExists(from.resolvedPath))) {
        return fail(`${action.path} does not exist.`, 'source-missing');
      }
      if (await fsExists(to.resolvedPath)) {
        return fail(`${action.toPath} already exists; I did not overwrite it.`, 'target-exists');
      }
      const approved = await context.approvalManager.request({
        kind: 'write',
        scope: 'project',
        title: 'Rename file',
        message: `Rename ${action.path} → ${action.toPath}?`,
        riskLevel: 'medium',
        resource: action.toPath,
      });
      if (!approved.approved) {
        return fail(`I did not rename ${action.path} because approval was denied.`);
      }
      await fs.mkdir(path.dirname(to.resolvedPath), {recursive: true});
      await fs.rename(from.resolvedPath, to.resolvedPath);
      tools.push({toolName: 'rename_file', ok: true, input: {from: action.path, to: action.toPath}});
      return {
        ok: true,
        summary: `Renamed ${action.path} to ${action.toPath}.`,
        filesChanged: [action.path, action.toPath],
        commandsRun: [],
        providerCalls: 0,
        tools,
      };
    }

    case 'delete_file': {
      const targets = action.paths?.length ? action.paths : action.path ? [action.path] : [];
      if (targets.length === 0) return fail('No file path was specified.');
      const resolved = targets.map((target) => ({assessment: assessPath(context.cwd, target), target}));
      if (resolved.some((entry) => entry.assessment.outsideProject)) {
        return fail('Refused: delete path is outside the workspace.', 'path-outside-workspace');
      }
      const missing: string[] = [];
      for (const entry of resolved) {
        if (!(await fsExists(entry.assessment.resolvedPath))) missing.push(entry.target);
      }
      if (missing.length > 0) return fail(`${missing.join(', ')} ${missing.length === 1 ? 'does' : 'do'} not exist.`, 'source-missing');
      const approved = await context.approvalManager.request({
        kind: 'write',
        scope: 'project',
        title: 'Delete file',
        message: `Delete ${targets.join(', ')}?`,
        riskLevel: 'high',
        resource: targets.join(', '),
      });
      if (!approved.approved) {
        return fail(`I did not delete ${targets.join(', ')} because approval was denied.`);
      }
      for (const entry of resolved) {
        await fs.rm(entry.assessment.resolvedPath, {force: true, recursive: false});
      }
      tools.push({toolName: 'delete_file', ok: true, input: {paths: targets}});
      return {
        ok: true,
        summary: `Deleted ${targets.join(', ')}.`,
        filesChanged: targets,
        commandsRun: [],
        providerCalls: 0,
        tools,
      };
    }

    case 'project_tree':
    case 'list_files': {
      const result = await invoke('project_tree', {});
      return {
        ok: result.ok,
        summary: result.summary || 'Project tree collected.',
        filesChanged: [],
        commandsRun: [],
        providerCalls: 0,
        tools,
        output: result.output,
      };
    }

    case 'read_file': {
      if (!action.path) return fail('No file path was specified.');
      const result = await invoke('read_file', {path: action.path});
      return {
        ok: result.ok,
        summary: result.ok ? `Read ${action.path}.` : `Could not read ${action.path}: ${result.summary}`,
        filesChanged: [],
        commandsRun: [],
        providerCalls: 0,
        tools,
        output: result.output,
      };
    }

    case 'run_command':
    case 'run_tests': {
      const command = action.command ?? 'npm test';
      const result = await invoke('run_command', {command});
      return {
        ok: result.ok,
        summary: result.ok ? `Ran \`${command}\`.` : `\`${command}\` failed: ${result.summary}`,
        filesChanged: [],
        commandsRun: [command],
        providerCalls: 0,
        tools,
        output: result.output,
      };
    }

    default:
      return fail('Action is not supported for direct execution.', 'unsupported');
  }
};

// Read / tree / command outputs are the whole point of those simple actions —
// dropping them on the floor leaves the user with a useless "Files changed:
// none" message. Show the content (truncated for huge files) when present.
const MAX_OUTPUT_LINES = 200;
const MAX_OUTPUT_CHARS = 8_000;

const truncateOutput = (text: string): {body: string; truncated: boolean} => {
  if (text.length <= MAX_OUTPUT_CHARS) {
    const lines = text.split('\n');
    if (lines.length <= MAX_OUTPUT_LINES) return {body: text, truncated: false};
    return {body: lines.slice(0, MAX_OUTPUT_LINES).join('\n'), truncated: true};
  }
  return {body: text.slice(0, MAX_OUTPUT_CHARS), truncated: true};
};

export const formatSimpleActionExecutionResult = (
  result: SimpleActionExecutionResult,
): string => {
  if (result.summary.includes('Created a static web app:')) return result.summary;
  const lines = [result.summary];
  if (result.ok && result.output && result.output.trim().length > 0) {
    const {body, truncated} = truncateOutput(result.output);
    lines.push('', body);
    if (truncated) lines.push(`... (truncated; ${result.output.length} bytes total)`);
  }
  lines.push('');
  lines.push(`Files changed: ${result.filesChanged.length ? result.filesChanged.join(', ') : 'none'}`);
  lines.push(`Commands run: ${result.commandsRun.length ? result.commandsRun.join(', ') : 'none'}`);
  lines.push('Provider calls: none');
  return lines.join('\n');
};
