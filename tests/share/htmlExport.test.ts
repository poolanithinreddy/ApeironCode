import {describe, expect, it} from 'vitest';

import {formatSessionHtml} from '../../src/share/formats/html.js';

describe('html session export', () => {
  it('is self-contained, includes code, and redacts secrets', () => {
    const output = formatSessionHtml({
      commandsRun: ['echo token=secret'],
      createdAt: new Date(0).toISOString(),
      exportedAt: new Date(0).toISOString(),
      filesChanged: ['src/a.ts'],
      filesLocked: [],
      goal: 'HTML export',
      projectPath: '/tmp/project',
      sessionId: 'session-1',
      status: 'done',
      summary: 'ok',
      testsRun: [],
    });
    expect(output).toContain('<style>');
    expect(output).toContain('<pre>$ echo token=[REDACTED]</pre>');
    expect(output).not.toContain('token=secret');
  });
});
