import {execa} from 'execa';

import type {HookDefinition, HookEvent, HookRunResult} from './types.js';
import type {ApprovalManager} from '../safety/approvals.js';
import {redactSecrets} from '../share/redactor.js';

const sanitizedEnv = (): Record<string, string> => {
  const allowed = ['CI', 'HOME', 'PATH', 'SHELL', 'TERM', 'TMPDIR'];
  return Object.fromEntries(allowed.map((key) => [key, process.env[key]]).filter((entry): entry is [string, string] => Boolean(entry[1])));
};

export const runHook = async (
  hook: HookDefinition,
  options: {approvalManager?: ApprovalManager; approvedShell?: boolean; cwd: string; event?: HookEvent; payload?: Record<string, unknown>} = {cwd: process.cwd()},
): Promise<HookRunResult> => {
  if (!hook.enabled) {
    return {event: hook.event, message: 'Hook is disabled.', name: hook.name, ok: true, skipped: true};
  }
  if (options.event && hook.event !== options.event) {
    return {event: hook.event, message: `Hook is for ${hook.event}, not ${options.event}.`, name: hook.name, ok: true, skipped: true};
  }
  if (hook.type === 'built-in') {
    return {event: hook.event, message: `Built-in hook ${hook.name} ran for ${hook.event}.`, name: hook.name, ok: true};
  }
  if (hook.type === 'skill') {
    return {event: hook.event, message: `Skill hook ${hook.name} selected ${hook.skill ?? '(missing skill)'}.`, name: hook.name, ok: true};
  }
  if (!hook.command) {
    return {event: hook.event, message: 'Shell hook has no command.', name: hook.name, ok: false};
  }
  if (!options.approvedShell) {
    if (!options.approvalManager) {
      return {event: hook.event, message: 'Shell hooks require explicit approval before execution.', name: hook.name, ok: false};
    }
    const approval = await options.approvalManager.request({
      details: [
        `Event: ${hook.event}`,
        `Command: ${hook.command}`,
        options.payload ? `Payload: ${redactSecrets(JSON.stringify(options.payload)).slice(0, 1000)}` : null,
      ].filter(Boolean).join('\n'),
      kind: 'command',
      message: `Run shell hook ${hook.name}?`,
      resource: `Hook(${hook.name})`,
      riskLevel: 'medium',
      scope: 'project',
      title: `Hook approval: ${hook.name}`,
    });
    if (!approval.approved) {
      return {event: hook.event, message: 'Shell hook was not approved.', name: hook.name, ok: false};
    }
  }
  const [command, ...args] = hook.command.split(/\s+/u).filter(Boolean);
  if (!command) {
    return {event: hook.event, message: 'Shell hook has no command.', name: hook.name, ok: false};
  }
  const result = await execa(command, args, {cwd: options.cwd, env: sanitizedEnv(), reject: false});
  return {
    event: hook.event,
    message: redactSecrets([result.stdout, result.stderr].filter(Boolean).join('\n') || `Exited ${result.exitCode}`),
    name: hook.name,
    ok: result.exitCode === 0,
  };
};
