import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import type {ApeironCodeConfig} from '../config/config.js';
import type {EventBus} from '../core/events/bus.js';
import {createEventTimestamp} from '../core/events/events.js';
import {ApprovalManager} from '../safety/approvals.js';
import type {ApprovalManager as ApprovalManagerType} from '../safety/approvals.js';
import type {ToolRegistry} from '../tools/registry.js';
import type {ToolExecutionContext} from '../tools/types.js';
import {validateFilePlan, formatFilePlanPreview, type FilePlan} from './filePlanProtocol.js';
import type {ToolCallRecord} from './types.js';

export interface FilePlanExecutionContext {
  approvalManager: ApprovalManagerType;
  config: ApeironCodeConfig;
  cwd: string;
  eventBus?: EventBus;
  sessionId?: string;
  signal?: AbortSignal;
  toolRegistry: ToolRegistry;
}

export interface FilePlanExecutionResult {
  commandsRun: string[];
  errors: string[];
  filesChanged: string[];
  /**
   * Files whose planned content was byte-identical to what is already on disk
   * (Phase 18A, Task D). These +0/-0 writes are NOT counted as real changes and
   * must not be treated as meaningful progress.
   */
  noopFiles: string[];
  ok: boolean;
  preview: string;
  summary: string;
  toolCalls: ToolCallRecord[];
}

const readExistingContent = async (cwd: string, rel: string): Promise<string | null> => {
  try {
    return await fs.readFile(path.resolve(cwd, rel), 'utf8');
  } catch {
    return null;
  }
};

const record = (
  toolName: string,
  input: Record<string, unknown>,
  status: ToolCallRecord['status'],
  result?: ToolCallRecord['result'],
  error?: string,
): ToolCallRecord => ({
  createdAt: new Date().toISOString(),
  error,
  id: crypto.randomUUID(),
  input,
  result,
  status,
  toolName,
});

export async function executeFilePlan(
  plan: FilePlan,
  context: FilePlanExecutionContext,
): Promise<FilePlanExecutionResult> {
  const validation = validateFilePlan(plan, context.cwd, {
    allowDelete: plan.files.some((file) => file.operation === 'delete'),
  });
  const preview = formatFilePlanPreview(plan);
  if (!validation.ok) {
    return {
      commandsRun: [],
      errors: validation.errors,
      filesChanged: [],
      noopFiles: [],
      ok: false,
      preview,
      summary: `File plan rejected: ${validation.errors.join('; ')}`,
      toolCalls: [],
    };
  }

  if (plan.files.length > 0) {
    context.eventBus?.emit({
      message: preview,
      timestamp: createEventTimestamp(),
      type: 'status.updated',
    });
    const approved = await context.approvalManager.request({
      details: preview,
      kind: 'write',
      message: 'Apply this batch of file changes?',
      resource: plan.files.map((file) => file.path).join(', '),
      riskLevel: plan.files.some((file) => file.operation === 'delete') ? 'high' : 'medium',
      scope: 'project',
      title: 'Approve file plan',
    });
    if (!approved.approved) {
      return {
        commandsRun: [],
        errors: ['Approval denied.'],
        filesChanged: [],
        noopFiles: [],
        ok: false,
        preview,
        summary: 'No files were changed because approval was denied.',
        toolCalls: [],
      };
    }
  }

  const preapproved = new ApprovalManager('bypass');
  const toolContext: ToolExecutionContext = {
    approvalManager: preapproved,
    config: context.config,
    cwd: context.cwd,
    eventBus: context.eventBus,
    preapprovedTools: ['write_file', 'edit_file', 'run_command'],
    sessionId: context.sessionId,
    signal: context.signal,
  };
  const filesChanged: string[] = [];
  const noopFiles: string[] = [];
  const commandsRun: string[] = [];
  const errors: string[] = [];
  const toolCalls: ToolCallRecord[] = [];

  for (const file of plan.files) {
    try {
      if (file.operation === 'rename') {
        const from = path.resolve(context.cwd, file.from ?? '');
        const to = path.resolve(context.cwd, file.path);
        await fs.mkdir(path.dirname(to), {recursive: true});
        await fs.rename(from, to);
        filesChanged.push(file.from ?? file.path, file.path);
        toolCalls.push(record('rename_file', {from: file.from, path: file.path}, 'success', {
          ok: true,
          output: file.path,
          summary: `Renamed ${file.from} to ${file.path}`,
        }));
        continue;
      }
      if (file.operation === 'delete') {
        await fs.rm(path.resolve(context.cwd, file.path), {force: true, recursive: false});
        filesChanged.push(file.path);
        toolCalls.push(record('delete_file', {path: file.path}, 'success', {
          ok: true,
          output: file.path,
          summary: `Deleted ${file.path}`,
        }));
        continue;
      }
      // Phase 18A, Task D: a write whose content matches the existing file is a
      // +0/-0 no-op. Record it but do not count it as a real change or invoke a
      // write, so the runtime never reports it as meaningful progress.
      if ((file.operation === 'modify' || file.operation === 'overwrite') &&
        (await readExistingContent(context.cwd, file.path)) === (file.content ?? '')) {
        noopFiles.push(file.path);
        toolCalls.push(record('write_file', {path: file.path}, 'success', {
          ok: true,
          output: file.path,
          summary: `No change: ${file.path} content already matches the plan (+0/-0).`,
        }));
        continue;
      }
      const result = await context.toolRegistry.invoke(
        'write_file',
        {content: file.content ?? '', path: file.path},
        toolContext,
      );
      toolCalls.push(record('write_file', {content: file.content ?? '', path: file.path}, result.ok ? 'success' : 'error', result, result.ok ? undefined : result.summary));
      if (!result.ok) {
        errors.push(result.summary);
        break;
      }
      filesChanged.push(file.path);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toolCalls.push(record(file.operation === 'delete' ? 'delete_file' : file.operation === 'rename' ? 'rename_file' : 'write_file', {path: file.path}, 'error', undefined, message));
      errors.push(message);
      break;
    }
  }

  if (errors.length > 0) {
    return {
      commandsRun,
      errors,
      filesChanged,
      noopFiles,
      ok: false,
      preview,
      summary: `Stopped after failure: ${errors[0]}`,
      toolCalls,
    };
  }

  for (const command of plan.commands) {
    const approved = await context.approvalManager.request({
      details: command.reason,
      kind: 'command',
      message: command.command,
      resource: command.command,
      riskLevel: 'medium',
      scope: 'project',
      title: 'Approve shell command',
    });
    if (!approved.approved) continue;
    const result = await context.toolRegistry.invoke('run_command', {command: command.command}, toolContext);
    commandsRun.push(command.command);
    toolCalls.push(record('run_command', {command: command.command}, result.ok ? 'success' : 'error', result, result.ok ? undefined : result.summary));
    if (!result.ok) {
      errors.push(result.output || result.summary);
      return {
        commandsRun,
        errors,
        filesChanged,
        noopFiles,
        ok: false,
        preview,
        summary: `Command failed: ${command.command}`,
        toolCalls,
      };
    }
  }

  const noopNote = noopFiles.length > 0 ? `, ${noopFiles.length} no-op (+0/-0)` : '';
  return {
    commandsRun,
    errors,
    filesChanged,
    noopFiles,
    ok: true,
    preview,
    summary: `Applied file plan: ${filesChanged.length} file(s) changed${noopNote}, ${commandsRun.length} command(s) run.`,
    toolCalls,
  };
}

export function formatFilePlanExecutionSummary(result: FilePlanExecutionResult): string {
  const lines = [result.summary];
  lines.push(`Files changed: ${result.filesChanged.length ? result.filesChanged.join(', ') : 'none'}`);
  if (result.noopFiles.length > 0) lines.push(`No-op (unchanged) files: ${result.noopFiles.join(', ')}`);
  lines.push(`Commands run: ${result.commandsRun.length ? result.commandsRun.join(', ') : 'none'}`);
  if (result.errors.length > 0) lines.push(`Errors: ${result.errors.join('; ')}`);
  return lines.join('\n');
}
