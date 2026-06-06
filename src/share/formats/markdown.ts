import {redactLogValue} from '../../utils/structuredLogger.js';
import type {SessionExport} from '../types.js';

const safe = (value: string): string => redactLogValue(value) as string;

export const formatSessionMarkdown = (session: SessionExport): string => {
  const lines = [
    `# Session Report: ${safe(session.goal)}`,
    '',
    `## ${safe(session.goal)}`,
    '',
    `- Session: \`${session.sessionId}\``,
    `- Status: ${session.status}`,
    `- Mode: ${session.mode ?? 'default'}`,
    `- Provider/Model: ${session.provider ?? 'default'} / ${session.model ?? 'default'}`,
    `- Created: ${session.createdAt}`,
    `- Exported: ${session.exportedAt}`,
    '',
    '> Secrets and auth headers are redacted in this export.',
    '',
    '## Summary',
    safe(session.summary ?? 'No summary available.'),
    '',
  ];

  if (session.filesChanged.length > 0) {
    lines.push('## Files Changed', ...session.filesChanged.slice(0, 20).map((file) => `- ${safe(file)}`));
    if (session.filesChanged.length > 20) lines.push(`- ... and ${session.filesChanged.length - 20} more`);
    lines.push('');
  }
  if (session.commandsRun.length > 0) {
    lines.push('## Commands Run');
    for (const command of session.commandsRun.slice(0, 20)) {
      lines.push('<details><summary>Command</summary>', '', '```sh', safe(command), '```', '', '</details>');
    }
    if (session.commandsRun.length > 20) lines.push(`- ... and ${session.commandsRun.length - 20} more`);
    lines.push('');
  }
  if (session.testsRun.length > 0) {
    lines.push('## Tests Run', ...session.testsRun.slice(0, 20).map((test) => `- ${safe(test)}`));
    if (session.testsRun.length > 20) lines.push(`- ... and ${session.testsRun.length - 20} more`);
    lines.push('');
  }
  if (session.events?.length) {
    lines.push('## Events');
    for (const event of session.events.slice(-100)) {
      lines.push(`- ${event.timestamp} ${event.type}: ${safe(event.message ?? '')}`);
    }
  }
  return lines.join('\n');
};
