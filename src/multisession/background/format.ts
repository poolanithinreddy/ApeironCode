import type {AgentSessionEvent} from './types.js';

function redactSecret(text: string): string {
  // Redact common secret patterns
  const patterns = [
    /api_key=['"]?[^'"\s]+['"]?/gi,
    /Bearer\s+[^\s]+/gi,
    /password=['"]?[^'"\s]+['"]?/gi,
    /Authorization:\s*[^\n]+/gi,
    /token=['"]?[^\s]+['"]?/gi,
  ];

  let result = text;
  for (const pattern of patterns) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

export function formatEvent(event: AgentSessionEvent): string {
  const timestamp = new Date(event.timestamp).toLocaleTimeString();
  const messageText = event.message ? ` — ${redactSecret(event.message)}` : '';

  const data: Record<string, unknown> = event.data ?? {};
  const stringify = (value: unknown, fallback = 'unknown'): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (value === null || value === undefined) return fallback;
    return fallback;
  };

  switch (event.type) {
    case 'session_started':
      return `[${timestamp}] ✓ Session started`;
    case 'session_queued':
      return `[${timestamp}] ⋯ Session queued`;
    case 'status_changed':
      return `[${timestamp}] ↔ Status: ${stringify(data.status)}${messageText}`;
    case 'tool_started':
      return `[${timestamp}] ▶ Tool: ${stringify(data.tool)}${messageText}`;
    case 'tool_completed':
      return `[${timestamp}] ✓ Tool completed: ${stringify(data.tool)}`;
    case 'tool_failed':
      return `[${timestamp}] ✗ Tool failed: ${stringify(data.tool)}${messageText}`;
    case 'file_locked':
      return `[${timestamp}] 🔒 File locked: ${stringify(data.file)}`;
    case 'file_changed':
      return `[${timestamp}] 📝 File changed: ${stringify(data.file)}`;
    case 'command_run':
      return `[${timestamp}] ▶ Command: ${redactSecret(stringify(data.command))}`;
    case 'test_run':
      return `[${timestamp}] ✓ Test: ${stringify(data.test)}`;
    case 'permission_decision':
      return `[${timestamp}] 🔐 Permission: ${stringify(data.decision)}`;
    case 'summary_updated':
      return `[${timestamp}] 📋 Summary updated`;
    case 'session_completed':
      return `[${timestamp}] ✓ Session completed`;
    case 'session_failed':
      return `[${timestamp}] ✗ Session failed${messageText}`;
    case 'session_stopped':
      return `[${timestamp}] ⏹ Session stopped`;
    default:
      return `[${timestamp}] ${event.type}${messageText}`;
  }
}

export function formatEventLog(events: AgentSessionEvent[]): string {
  if (events.length === 0) {
    return 'No events recorded yet.';
  }

  return events.map(formatEvent).join('\n');
}

export function formatRecentEventsForAttach(events: AgentSessionEvent[], maxCount: number = 20): string {
  const recent = events.slice(Math.max(0, events.length - maxCount));
  if (recent.length === 0) {
    return 'No events yet.';
  }

  let output = 'Recent events:\n';
  output += recent.map(formatEvent).join('\n');

  if (events.length > maxCount) {
    output += `\n\n... and ${events.length - maxCount} more events`;
  }

  return output;
}

export function formatEventSummary(events: AgentSessionEvent[]): string {
  const statusChanges = events.filter(e => e.type === 'status_changed');
  const toolEvents = events.filter(e => e.type === 'tool_started' || e.type === 'tool_completed' || e.type === 'tool_failed');
  const errors = events.filter(e => e.type === 'tool_failed' || e.type === 'session_failed');

  let output = '';
  output += `Events: ${events.length} total`;

  if (statusChanges.length > 0) {
    output += ` | Status changes: ${statusChanges.length}`;
  }

  if (toolEvents.length > 0) {
    output += ` | Tool executions: ${toolEvents.length}`;
  }

  if (errors.length > 0) {
    output += ` | Errors: ${errors.length}`;
  }

  return output;
}

export function formatEventLogForExport(events: AgentSessionEvent[]): string {
  if (events.length === 0) {
    return 'No events recorded.';
  }

  let output = '## Event Timeline\n\n';

  for (const event of events) {
    output += `- ${formatEvent(event)}\n`;
  }

  return output;
}
