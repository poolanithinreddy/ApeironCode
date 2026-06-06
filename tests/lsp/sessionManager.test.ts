import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {LspSessionManager} from '../../src/lsp/sessionManager.js';
import type {LspDetectionResult} from '../../src/lsp/types.js';

const mockServerPath = path.resolve(process.cwd(), 'tests/fixtures/lsp/mock-lsp-server.mjs');

describe('LspSessionManager', () => {
  const tempDirs: string[] = [];
  const managers: LspSessionManager[] = [];

  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(async () => {
    await Promise.all(managers.splice(0).map(async (manager) => {
      await manager.dispose();
    }));
    await Promise.all(tempDirs.splice(0).map(async (tempDir) => {
      await fs.rm(tempDir, {force: true, recursive: true});
    }));
  });

  const createManager = (overrides?: Partial<ConstructorParameters<typeof LspSessionManager>[0]>): LspSessionManager => {
    const manager = new LspSessionManager({
      fallbackOnFailure: true,
      idleTimeoutMs: 300_000,
      longLivedSessions: true,
      maxSessions: 5,
      requestTimeoutMs: 250,
      startupTimeoutMs: 250,
      ...overrides,
    });
    managers.push(manager);
    return manager;
  };

  const createStatus = (workspaceRoot: string, overrides?: Partial<LspDetectionResult>): LspDetectionResult => ({
    installed: true,
    language: 'TypeScript',
    reason: undefined,
    serverArgs: [mockServerPath, '--publish-diagnostics'],
    serverCommand: process.execPath,
    serverName: 'mock-lsp',
    status: 'available',
    version: '1.0.0',
    workspaceApplicable: true,
    ...overrides,
  });

  const createTempWorkspace = async (fileName = 'example.ts'): Promise<{filePath: string; workspaceRoot: string}> => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-lsp-session-'));
    tempDirs.push(workspaceRoot);
    const filePath = path.join(workspaceRoot, fileName);
    await fs.writeFile(filePath, 'export function runAgentLoop() {}\n');
    return {filePath, workspaceRoot};
  };

  it('starts a session and reuses it for the same workspace, language, and server', async () => {
    const {workspaceRoot} = await createTempWorkspace();
    const manager = createManager();
    const status = createStatus(workspaceRoot);

    const sessionA = await manager.getOrCreateSession(workspaceRoot, status);
    const sessionB = await manager.getOrCreateSession(workspaceRoot, status);
    await sessionA?.ensureReady();

    expect(sessionA).toBe(sessionB);
    expect(manager.listSessions()).toHaveLength(1);
    expect(manager.listSessions()[0]?.status).toBe('ready');
  });

  it('creates separate sessions for separate workspace or language keys', async () => {
    const first = await createTempWorkspace('first.ts');
    const second = await createTempWorkspace('second.ts');
    const manager = createManager();

    const typeScriptSession = await manager.getOrCreateSession(first.workspaceRoot, createStatus(first.workspaceRoot));
    const javaScriptSession = await manager.getOrCreateSession(second.workspaceRoot, createStatus(second.workspaceRoot, {language: 'JavaScript'}));

    expect(typeScriptSession).not.toBe(javaScriptSession);
    expect(manager.listSessions()).toHaveLength(2);
  });

  it('shuts down sessions and removes them from the manager', async () => {
    const {workspaceRoot} = await createTempWorkspace();
    const manager = createManager();
    const session = await manager.getOrCreateSession(workspaceRoot, createStatus(workspaceRoot));
    await session?.ensureReady();

    const stopped = await manager.stopSessions('TypeScript');

    expect(stopped).toBe(1);
    expect(manager.listSessions()).toHaveLength(0);
  });

  it('marks the session degraded when the server crashes during a request', async () => {
    const {filePath, workspaceRoot} = await createTempWorkspace();
    const manager = createManager();
    const session = await manager.getOrCreateSession(workspaceRoot, createStatus(workspaceRoot, {
      serverArgs: [mockServerPath, '--exit-on-method=textDocument/documentSymbol'],
    }));
    await session?.ensureReady();

    await expect(session?.getDocumentSymbols(filePath)).rejects.toThrow();

    expect(manager.listSessions()[0]?.status).toBe('degraded');
  });

  it('cleans up idle sessions with fake timers', async () => {
    vi.useFakeTimers();

    const {workspaceRoot} = await createTempWorkspace();
    const manager = createManager({idleTimeoutMs: 1_000});
    const session = await manager.getOrCreateSession(workspaceRoot, createStatus(workspaceRoot));
    await session?.ensureReady();

    await vi.advanceTimersByTimeAsync(2_000);

    expect(manager.listSessions()).toHaveLength(0);
  });

  it('tracks didOpen, didChange, and didClose through a long-lived session', async () => {
    const {filePath, workspaceRoot} = await createTempWorkspace();
    const manager = createManager();
    const session = await manager.getOrCreateSession(workspaceRoot, createStatus(workspaceRoot));

    await session?.getDocumentSymbols(filePath);
    await fs.writeFile(filePath, 'export function runAgentLoopChanged() {}\n');
    await session?.getDiagnostics(filePath);

    const beforeShutdown = session?.getNotificationCounts();
    await session?.shutdown();
    const afterShutdown = session?.getNotificationCounts();

    expect(beforeShutdown?.didOpen).toBe(1);
    expect(beforeShutdown?.didChange).toBe(1);
    expect(afterShutdown?.didClose).toBe(1);
  });
});