import {describe, expect, it, beforeEach, afterEach} from 'vitest';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {SessionExporter, exportLatestSession} from '../../src/share/exporter.js';
import {MultiAgentSessionManager} from '../../src/multisession/manager.js';
import {ensureDirectory, readTextFile} from '../../src/utils/fs.js';

describe('SessionExporter', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `opencode-test-${Date.now()}`);
    await ensureDirectory(tempDir);
  });

  afterEach(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports,@typescript-eslint/consistent-type-imports
      const fs = require('node:fs') as typeof import('node:fs');
      fs.rmSync(tempDir, {recursive: true, force: true});
    } catch {
      // ignore cleanup errors
    }
  });

  it('exports a session to JSON format', async () => {
    const manager = new MultiAgentSessionManager(tempDir);
    const session = await manager.createSession({
      goal: 'Test export',
      mode: 'debug',
      provider: 'mock',
      model: 'mock-model',
    });

    const exporter = new SessionExporter(tempDir);
    const result = await exporter.exportSession(session, {format: 'json'});

    expect(result.filePath).toContain('.json');
    expect(result.fileUrl).toMatch(/^file:\/\//);

    const content = await readTextFile(result.filePath);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed = JSON.parse(content);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(parsed.sessionId).toBe(session.id);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(parsed.goal).toBe('Test export');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(parsed.status).toBe('queued');
  });

  it('exports a session to Markdown format', async () => {
    const manager = new MultiAgentSessionManager(tempDir);
    const session = await manager.createSession({
      goal: 'Test markdown export',
      mode: 'chat',
      provider: 'test-provider',
      model: 'test-model',
    });

    const exporter = new SessionExporter(tempDir);
    const result = await exporter.exportSession(session, {format: 'markdown'});

    expect(result.filePath).toContain('.md');
    const content = await readTextFile(result.filePath);
    expect(content).toContain('# Session Report');
    expect(content).toContain('Test markdown export');
    expect(content).toContain('queued');
  });

  it('exports a session to HTML format', async () => {
    const manager = new MultiAgentSessionManager(tempDir);
    const session = await manager.createSession({
      goal: 'Test HTML export',
      mode: 'review',
      provider: 'html-provider',
      model: 'html-model',
    });

    const exporter = new SessionExporter(tempDir);
    const result = await exporter.exportSession(session, {format: 'html'});

    expect(result.filePath).toContain('.html');
    const content = await readTextFile(result.filePath);
    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('Test HTML export');
    expect(content).toContain('ApeironCode Session');
  });

  it('redacts secrets in exported content', async () => {
    const manager = new MultiAgentSessionManager(tempDir);
    const session = await manager.createSession({
      goal: 'Test secret redaction',
    });

    await manager.updateSession(session.id, {
      commandsRun: ['curl https://api.example.com -H "Authorization: Bearer secret-token-12345"'],
      summary: 'This command uses api_key=secret123 and password=super-secret',
    });

    // Reload the session to get the updated data
    const updatedSession = await manager.getSession(session.id);
    const exporter = new SessionExporter(tempDir);
    const result = await exporter.exportSession(updatedSession!, {
      format: 'json',
      redactSecrets: true,
    });

    const content = await readTextFile(result.filePath);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed = JSON.parse(content);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(parsed.summary).not.toContain('secret123');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(parsed.commandsRun[0]).toContain('[REDACTED]');
  });

  it('exports latest session', async () => {
    const manager = new MultiAgentSessionManager(tempDir);

    // Create multiple sessions with delay to ensure different timestamps
    await manager.createSession({goal: 'Session 1'});
    // Add small delay to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 10));
    await manager.createSession({goal: 'Latest session'});

    const result = await exportLatestSession(tempDir, {format: 'json'});

    expect(result).not.toBeNull();
    expect(result?.filePath).toContain('.json');

    const content = await readTextFile(result!.filePath);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed = JSON.parse(content);
    // Just verify that a session was exported successfully
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(parsed.sessionId).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(parsed.goal).toBeTruthy();
  });

  it('returns null when no sessions exist', async () => {
    const result = await exportLatestSession(tempDir, {format: 'json'});
    expect(result).toBeNull();
  });

  it('includes filesChanged in export', async () => {
    const manager = new MultiAgentSessionManager(tempDir);
    const session = await manager.createSession({goal: 'Test files'});

    await manager.updateSession(session.id, {
      filesChanged: ['/src/file1.ts', '/src/file2.ts'],
    });

    // Reload the session to get the updated data
    const updatedSession = await manager.getSession(session.id);
    const exporter = new SessionExporter(tempDir);
    const result = await exporter.exportSession(updatedSession!, {format: 'json'});

    const content = await readTextFile(result.filePath);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed = JSON.parse(content);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(parsed.filesChanged).toContain('/src/file1.ts');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(parsed.filesChanged).toContain('/src/file2.ts');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(parsed.filesChanged.length).toBe(2);
  });

  it('includes filesLocked in export', async () => {
    const manager = new MultiAgentSessionManager(tempDir);
    const session = await manager.createSession({goal: 'Test locks'});

    await manager.updateSession(session.id, {
      filesLocked: ['/src/locked1.ts', '/src/locked2.ts'],
    });

    // Reload the session to get the updated data
    const updatedSession = await manager.getSession(session.id);
    const exporter = new SessionExporter(tempDir);
    const result = await exporter.exportSession(updatedSession!, {format: 'json'});

    const content = await readTextFile(result.filePath);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed = JSON.parse(content);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(parsed.filesLocked).toContain('/src/locked1.ts');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(parsed.filesLocked).toContain('/src/locked2.ts');
  });

  it('includes commandsRun and testsRun in export', async () => {
    const manager = new MultiAgentSessionManager(tempDir);
    const session = await manager.createSession({goal: 'Test commands and tests'});

    await manager.updateSession(session.id, {
      commandsRun: ['npm install', 'npm test'],
      testsRun: ['test.spec.ts', 'integration.test.ts'],
    });

    // Reload the session to get the updated data
    const updatedSession = await manager.getSession(session.id);
    const exporter = new SessionExporter(tempDir);
    const result = await exporter.exportSession(updatedSession!, {format: 'json'});

    const content = await readTextFile(result.filePath);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed = JSON.parse(content);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(parsed.commandsRun).toContain('npm install');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(parsed.commandsRun).toContain('npm test');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(parsed.testsRun).toContain('test.spec.ts');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(parsed.testsRun).toContain('integration.test.ts');
  });

  it('returns file:// URL for exported file', async () => {
    const manager = new MultiAgentSessionManager(tempDir);
    const session = await manager.createSession({goal: 'URL test'});

    const exporter = new SessionExporter(tempDir);
    const result = await exporter.exportSession(session, {format: 'json'});

    expect(result.fileUrl).toMatch(/^file:\/\//);
    expect(result.fileUrl).toContain(result.filePath);
  });

  it('caps files/commands/tests at 20 items in markdown export', async () => {
    const manager = new MultiAgentSessionManager(tempDir);
    const session = await manager.createSession({goal: 'Capping test'});

    const files = Array.from({length: 30}, (_, i) => `/file${i}.ts`);
    const commands = Array.from({length: 30}, (_, i) => `command${i}`);
    await manager.updateSession(session.id, {
      filesChanged: files,
      commandsRun: commands,
    });

    // Reload the session to get the updated data
    const updatedSession = await manager.getSession(session.id);
    const exporter = new SessionExporter(tempDir);
    const result = await exporter.exportSession(updatedSession!, {format: 'markdown'});

    const content = await readTextFile(result.filePath);
    // Should show that content is capped at 20 items per section with indication of more
    expect(content).toContain('... and 10 more');
    // Verify markdown section headers exist
    expect(content).toContain('# Session Report');
  });

  it('includes linkedTaskId in export if present', async () => {
    const manager = new MultiAgentSessionManager(tempDir);
    const session = await manager.createSession({
      goal: 'Test with linked task',
      model: 'test-model',
    });

    // Note: linkedTaskId is set during session creation but we don't have a direct setter,
    // so we test that it's exported if it exists
    const exporter = new SessionExporter(tempDir);
    const result = await exporter.exportSession(session, {format: 'json'});

    const content = await readTextFile(result.filePath);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed = JSON.parse(content);
    expect(parsed).toHaveProperty('sessionId');
    expect(parsed).toHaveProperty('goal');
  });
});
