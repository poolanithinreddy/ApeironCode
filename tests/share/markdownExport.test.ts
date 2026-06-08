import {describe, expect, it} from 'vitest';

import {formatSessionMarkdown} from '../../src/share/formats/markdown.js';
import type {SessionExport} from '../../src/share/types.js';

const session = (): SessionExport => ({
  commandsRun: ['curl -H "Authorization: Bearer secret-token"'],
  createdAt: new Date(0).toISOString(),
  events: [{id: '1', message: 'tool ok', timestamp: new Date(0).toISOString(), type: 'tool.completed'}],
  exportedAt: new Date(0).toISOString(),
  filesChanged: ['src/a.ts'],
  filesLocked: [],
  goal: 'Export session',
  projectPath: '/tmp/project',
  sessionId: 'session-1',
  status: 'completed',
  summary: 'Fixed bug with api_key=secret',
  testsRun: ['npm test'],
});

describe('markdown session export', () => {
  it('formats tool/command details and redacts secrets', () => {
    const output = formatSessionMarkdown(session());
    expect(output).toContain('<details>');
    expect(output).toContain('src/a.ts');
    expect(output).not.toContain('secret-token');
    expect(output).not.toContain('api_key=secret');
  });
});
