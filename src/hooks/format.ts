import type {HookDefinition, HookExecutionRecord, HookRunResult} from './types.js';

export const formatHooks = (hooks: HookDefinition[]): string => {
  if (hooks.length === 0) {
    return 'No hooks configured. Create .apeironcode-agent/hooks.json to add lifecycle automation.';
  }
  return hooks.map((hook) => `${hook.enabled ? 'on ' : 'off'} | ${hook.name} | ${hook.event} | ${hook.type}${hook.command ? ` | ${hook.command}` : ''}${hook.skill ? ` | skill:${hook.skill}` : ''}`).join('\n');
};

export const formatHookRunResult = (result: HookRunResult): string =>
  `${result.ok ? 'PASS' : 'FAIL'} ${result.name}${result.skipped ? ' (skipped)' : ''}: ${result.message}`;

export const formatHookEvents = (events: HookExecutionRecord[]): string => {
  if (events.length === 0) {
    return 'No hook events recorded.';
  }
  return events
    .map((event) => `${event.timestamp} | ${event.ok ? 'ok' : 'fail'} | ${event.event ?? 'unknown'} | ${event.name} | ${event.durationMs}ms | ${event.message}`)
    .join('\n');
};
