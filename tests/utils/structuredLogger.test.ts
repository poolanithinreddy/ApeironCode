import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

import {readRecentLogLines, StructuredLogger} from '../../src/utils/structuredLogger.js';

const waitForWrite = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('StructuredLogger', () => {
  it('writes JSONL, filters levels, redacts secrets, and rotates old logs', async () => {
    const logDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-logs-'));
    await fs.writeFile(path.join(logDir, 'opencode-2000-01-01.jsonl'), '{}\n');
    const logger = new StructuredLogger({level: 'info', logDir, retentionDays: 7});

    logger.debug('hidden', {token: 'secret'});
    logger.info('hello api_key=abc123', {Authorization: 'Bearer secret-token', nested: {password: 'pw'}});
    await waitForWrite();

    const lines = await readRecentLogLines(logDir, 10);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('hello api_key=[REDACTED]');
    expect(lines[0]).not.toContain('secret-token');
    expect(await fs.readdir(logDir)).not.toContain('opencode-2000-01-01.jsonl');
  });

  it('handles write errors gracefully', () => {
    const logger = new StructuredLogger({logDir: '/dev/null/nope'});
    expect(() => logger.error('still fine')).not.toThrow();
  });
});
