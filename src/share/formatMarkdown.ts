import type {SessionExport} from './types.js';

export const formatMarkdownExport = (session: SessionExport): string => {
  const lines: string[] = [];

  lines.push(`# Session Report: ${session.goal}`);
  lines.push('');

  lines.push('## Metadata');
  lines.push(`- **Session ID**: \`${session.sessionId}\``);
  lines.push(`- **Status**: ${session.status}`);
  lines.push(`- **Mode**: ${session.mode || 'default'}`);
  lines.push(`- **Model**: ${session.model || 'default'}`);
  lines.push(`- **Provider**: ${session.provider || 'default'}`);
  lines.push('');

  lines.push('## Timeline');
  lines.push(`- **Created**: ${new Date(session.createdAt).toLocaleString()}`);
  if (session.startedAt) {
    lines.push(`- **Started**: ${new Date(session.startedAt).toLocaleString()}`);
  }
  if (session.completedAt) {
    lines.push(`- **Completed**: ${new Date(session.completedAt).toLocaleString()}`);
  }
  if (session.durationMs) {
    const mins = Math.round(session.durationMs / 60000);
    lines.push(`- **Duration**: ${mins} minutes`);
  }
  lines.push('');

  lines.push('## Work Summary');
  if (session.summary) {
    lines.push(session.summary);
  } else {
    lines.push('No summary available.');
  }
  lines.push('');

  if (session.events && session.events.length > 0) {
    lines.push('## Event Timeline');
    for (const event of session.events.slice(0, 100)) {
      const timestamp = new Date(event.timestamp).toLocaleTimeString();
      lines.push(`- [${timestamp}] **${event.type}**: ${event.message || '(no message)'}`);
    }
    if (session.events.length > 100) {
      lines.push(`- ... and ${session.events.length - 100} more events`);
    }
    lines.push('');
  }

  if (session.filesChanged.length > 0) {
    lines.push('## Files Changed');
    for (const file of session.filesChanged.slice(0, 20)) {
      lines.push(`- ${file}`);
    }
    if (session.filesChanged.length > 20) {
      lines.push(`- ... and ${session.filesChanged.length - 20} more`);
    }
    lines.push('');
  }

  if (session.filesLocked.length > 0) {
    lines.push('## Files Locked');
    for (const file of session.filesLocked.slice(0, 20)) {
      lines.push(`- ${file}`);
    }
    lines.push('');
  }

  if (session.commandsRun.length > 0) {
    lines.push('## Commands Run');
    for (const cmd of session.commandsRun.slice(0, 20)) {
      lines.push(`- \`${cmd}\``);
    }
    if (session.commandsRun.length > 20) {
      lines.push(`- ... and ${session.commandsRun.length - 20} more`);
    }
    lines.push('');
  }

  if (session.testsRun.length > 0) {
    lines.push('## Tests Run');
    for (const test of session.testsRun.slice(0, 20)) {
      lines.push(`- ${test}`);
    }
    lines.push('');
  }

  lines.push('## Export Info');
  lines.push(`- **Exported**: ${new Date(session.exportedAt).toLocaleString()}`);
  lines.push(`- **Project**: ${session.projectPath}`);
  if (session.linkedTaskId) {
    lines.push(`- **Linked Task**: ${session.linkedTaskId}`);
  }

  return lines.join('\n');
};
