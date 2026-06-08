import {describe, expect, it, beforeEach, afterEach} from 'vitest';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {SessionLogStore} from '../../src/multisession/background/logStore.js';
import {ProcessManager} from '../../src/multisession/background/processManager.js';
import {BackgroundSessionRunner} from '../../src/multisession/background/runner.js';
import {MultiAgentSessionManager} from '../../src/multisession/manager.js';
import {ensureDirectory} from '../../src/utils/fs.js';

describe('Background Runner', () => {
  let tempDir: string;
  let sessionManager: MultiAgentSessionManager;
  let logStore: SessionLogStore;
  let runner: BackgroundSessionRunner;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'opencode-test-'));
    await ensureDirectory(tempDir);
    sessionManager = new MultiAgentSessionManager(tempDir);
    logStore = new SessionLogStore(tempDir);
    runner = new BackgroundSessionRunner(tempDir);
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

  describe('SessionLogStore', () => {
    it('appends events to log file', async () => {
      const sessionId = 'test-session-123';
      await logStore.appendEvent(sessionId, 'session_started', 'Starting session');

      const events = await logStore.readEvents(sessionId);
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('session_started');
      expect(events[0]?.message).toBe('Starting session');
    });

    it('reads multiple events in order', async () => {
      const sessionId = 'test-session-456';
      await logStore.appendEvent(sessionId, 'session_started', 'Start');
      await logStore.appendEvent(sessionId, 'tool_started', 'Tool1');
      await logStore.appendEvent(sessionId, 'tool_completed', 'Tool1');

      const events = await logStore.readEvents(sessionId);
      expect(events).toHaveLength(3);
      expect(events[0]?.type).toBe('session_started');
      expect(events[1]?.type).toBe('tool_started');
      expect(events[2]?.type).toBe('tool_completed');
    });

    it('tails recent events', async () => {
      const sessionId = 'test-session-tail';
      for (let i = 0; i < 100; i++) {
        await logStore.appendEvent(sessionId, 'command_run', `Event ${i}`);
      }

      const tail = await logStore.getTailEvents(sessionId, 20);
      expect(tail).toHaveLength(20);
      expect(tail[0]?.message).toBe('Event 80');
      expect(tail[19]?.message).toBe('Event 99');
    });

    it('returns empty list for non-existent session', async () => {
      const events = await logStore.readEvents('non-existent-session');
      expect(events).toEqual([]);
    });

    it('handles event data with redaction needs', async () => {
      const sessionId = 'test-data-session';
      await logStore.appendEvent(sessionId, 'command_run', 'Running command', {
        command: 'curl https://api.example.com -H "Authorization: Bearer token"',
        exitCode: 0,
      });

      const events = await logStore.readEvents(sessionId);
      expect(events).toHaveLength(1);
      expect(events[0]?.data?.command).toBe(
        'curl https://api.example.com -H "Authorization: Bearer token"',
      );
    });
  });

  describe('ProcessManager', () => {
    it('spawns worker process', () => {
      const manager = new ProcessManager(tempDir);
      const result = manager.spawnWorker('test-session');

      expect(result).not.toBeNull();
      expect(result?.pid).toBeGreaterThan(0);
      expect(result?.command).toContain('session');
      expect(result?.command).toContain('run-worker');
    });

    it('handles invalid process id gracefully', () => {
      const manager = new ProcessManager(tempDir);
      const invalidPid = 99999999;

      const isRunning = manager.isProcessRunning(invalidPid);
      expect(isRunning).toBe(false);
    });

    it('does not crash on stop with fake pid', () => {
      const manager = new ProcessManager(tempDir);
      const result = manager.stopProcess(99999999);

      expect(result).toBe(false);
    });
  });

  describe('BackgroundSessionRunner', () => {
    it('logs session events', async () => {
      const session = await sessionManager.createSession({goal: 'Test'});
      await runner.logSessionEvent(session.id, 'session_started', 'Test start');

      const events = await runner.getEventLog(session.id);
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('session_started');
    });

    it('stops session and releases locks', async () => {
      const session = await sessionManager.createSession({goal: 'Test'});
      await sessionManager.acquireFileLock('/test/file.ts', session.id, session.goal);

      const locksBefore = await sessionManager.listFileLocks();
      expect(locksBefore.length).toBeGreaterThan(0);

      const stopped = await runner.stopSession(session.id);
      expect(stopped).toBe(true);

      const updated = await sessionManager.getSession(session.id);
      expect(updated?.status).toBe('stopped');
    });

    it('handles stop of non-existent session gracefully', async () => {
      const stopped = await runner.stopSession('non-existent-session');
      expect(stopped).toBe(false);
    });

    it('gets recent events', async () => {
      const session = await sessionManager.createSession({goal: 'Test'});
      for (let i = 0; i < 100; i++) {
        await runner.logSessionEvent(session.id, 'command_run', `Event ${i}`);
      }

      const recent = await runner.getTailEvents(session.id, 20);
      expect(recent).toHaveLength(20);
    });

    it('streams events', async () => {
      const session = await sessionManager.createSession({goal: 'Test'});
      for (let i = 0; i < 5; i++) {
        await runner.logSessionEvent(session.id, 'command_run', `Event ${i}`);
      }

      const eventStream = runner.streamEvents(session.id, {tail: 5});
      const events = [];
      for await (const event of eventStream) {
        events.push(event);
      }

      expect(events).toHaveLength(5);
    });

    it('stores and retrieves worker metadata', async () => {
      const session = await sessionManager.createSession({goal: 'Test'});
      const workerPid = 12345;
      const workerCommand = 'apeironcode session run-worker test-id';

      await sessionManager.storeWorkerMetadata(session.id, workerPid, workerCommand);

      const updated = await sessionManager.getSession(session.id);
      expect(updated?.workerPid).toBe(workerPid);
      expect(updated?.workerCommand).toBe(workerCommand);
      expect(updated?.workerStatus).toBe('spawned');
      expect(updated?.workerStartedAt).toBeDefined();
    });

    it('handles worker events (worker_started, lock_released)', async () => {
      const session = await sessionManager.createSession({goal: 'Test'});

      await runner.logSessionEvent(session.id, 'worker_started', 'Background worker process started');
      await runner.logSessionEvent(session.id, 'session_started', 'Agent started');
      await runner.logSessionEvent(session.id, 'command_run', 'Running test command');
      await runner.logSessionEvent(session.id, 'lock_released', 'All locks released');

      const events = await runner.getEventLog(session.id);
      expect(events).toHaveLength(4);
      expect(events[0]?.type).toBe('worker_started');
      expect(events[3]?.type).toBe('lock_released');
    });
  });
});
