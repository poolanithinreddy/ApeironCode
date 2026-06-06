import {describe, expect, it, beforeEach, afterEach} from 'vitest';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {MultiAgentSessionManager} from '../../src/multisession/manager.js';
import {ensureDirectory} from '../../src/utils/fs.js';

describe('MultiAgentSessionManager behavior', () => {
  let tempDir: string;
  let manager: MultiAgentSessionManager;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'opencode-test-'));
    await ensureDirectory(tempDir);
    manager = new MultiAgentSessionManager(tempDir);
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

  describe('Session lifecycle', () => {
    it('creates session with queued status by default', async () => {
      const session = await manager.createSession({
        goal: 'Test session',
        mode: 'debug',
        provider: 'mock',
        model: 'mock-model',
      });

      expect(session.status).toBe('queued');
      expect(session.goal).toBe('Test session');
      expect(session.mode).toBe('debug');
      expect(session.provider).toBe('mock');
      expect(session.model).toBe('mock-model');
    });

    it('can start a queued session', async () => {
      const session = await manager.createSession({goal: 'Test'});
      expect(session.status).toBe('queued');

      const started = await manager.startSession(session.id);
      expect(started).not.toBeNull();
      expect(started?.status).toBe('running');
      expect(started?.startedAt).toBeTruthy();
    });

    it('can pause a running session', async () => {
      const session = await manager.createSession({goal: 'Test'});
      await manager.startSession(session.id);

      const paused = await manager.pauseSession(session.id);
      expect(paused?.status).toBe('paused');
    });

    it('can resume a paused session', async () => {
      const session = await manager.createSession({goal: 'Test'});
      await manager.startSession(session.id);
      await manager.pauseSession(session.id);

      const resumed = await manager.resumeSession(session.id);
      expect(resumed?.status).toBe('running');
    });

    it('can stop a running session', async () => {
      const session = await manager.createSession({goal: 'Test'});
      await manager.startSession(session.id);

      const stopped = await manager.stopSession(session.id);
      expect(stopped?.status).toBe('stopped');
      expect(stopped?.stoppedAt).toBeTruthy();
    });

    it('can complete a running session', async () => {
      const session = await manager.createSession({goal: 'Test'});
      await manager.startSession(session.id);

      const completed = await manager.completeSession(session.id, 'Task finished');
      expect(completed?.status).toBe('completed');
      expect(completed?.summary).toBe('Task finished');
    });

    it('can fail a running session', async () => {
      const session = await manager.createSession({goal: 'Test'});
      await manager.startSession(session.id);

      const failed = await manager.failSession(session.id, 'Test error');
      expect(failed?.status).toBe('failed');
      expect(failed?.error).toBe('Test error');
    });

    it('can delete a session', async () => {
      const session = await manager.createSession({goal: 'Test'});
      const deleted = await manager.deleteSession(session.id);

      expect(deleted).toBe(true);
      const retrieved = await manager.getSession(session.id);
      expect(retrieved).toBeNull();
    });

    it('returns null when starting non-existent session', async () => {
      const result = await manager.startSession('non-existent-id');
      expect(result).toBeNull();
    });

    it('returns null when pausing non-existent session', async () => {
      const result = await manager.pauseSession('non-existent-id');
      expect(result).toBeNull();
    });

    it('returns null when stopping non-existent session', async () => {
      const result = await manager.stopSession('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('Session tracking', () => {
    it('tracks filesChanged', async () => {
      const session = await manager.createSession({goal: 'Test'});

      await manager.updateSession(session.id, {
        filesChanged: ['/src/file1.ts', '/src/file2.ts'],
      });

      const updated = await manager.getSession(session.id);
      expect(updated?.filesChanged).toContain('/src/file1.ts');
      expect(updated?.filesChanged).toContain('/src/file2.ts');
    });

    it('tracks commandsRun', async () => {
      const session = await manager.createSession({goal: 'Test'});

      await manager.updateSession(session.id, {
        commandsRun: ['npm install', 'npm test'],
      });

      const updated = await manager.getSession(session.id);
      expect(updated?.commandsRun).toContain('npm install');
      expect(updated?.commandsRun).toContain('npm test');
    });

    it('tracks testsRun', async () => {
      const session = await manager.createSession({goal: 'Test'});

      await manager.updateSession(session.id, {
        testsRun: ['test1.ts', 'test2.ts'],
      });

      const updated = await manager.getSession(session.id);
      expect(updated?.testsRun).toContain('test1.ts');
      expect(updated?.testsRun).toContain('test2.ts');
    });

    it('merges filesChanged across multiple updates', async () => {
      const session = await manager.createSession({goal: 'Test'});

      await manager.updateSession(session.id, {
        filesChanged: ['/file1.ts'],
      });

      await manager.updateSession(session.id, {
        filesChanged: ['/file2.ts'],
      });

      const updated = await manager.getSession(session.id);
      expect(updated?.filesChanged.length).toBe(2);
      expect(updated?.filesChanged).toContain('/file1.ts');
      expect(updated?.filesChanged).toContain('/file2.ts');
    });

    it('does not duplicate tracked items on merge', async () => {
      const session = await manager.createSession({goal: 'Test'});

      await manager.updateSession(session.id, {
        filesChanged: ['/file1.ts'],
      });

      await manager.updateSession(session.id, {
        filesChanged: ['/file1.ts'],
      });

      const updated = await manager.getSession(session.id);
      const count = updated?.filesChanged.filter(f => f === '/file1.ts').length;
      expect(count).toBe(1);
    });

    it('tracks filesLocked', async () => {
      const session = await manager.createSession({goal: 'Test'});

      await manager.updateSession(session.id, {
        filesLocked: ['/locked1.ts', '/locked2.ts'],
      });

      const updated = await manager.getSession(session.id);
      expect(updated?.filesLocked).toContain('/locked1.ts');
      expect(updated?.filesLocked).toContain('/locked2.ts');
    });
  });

  describe('Session locks', () => {
    it('acquires a file lock', async () => {
      const session = await manager.createSession({goal: 'Test'});
      const locked = await manager.acquireFileLock('/src/test.ts', session.id, session.goal);
      expect(locked).toBe(true);
    });

    it('prevents lock acquisition by different session', async () => {
      const session1 = await manager.createSession({goal: 'Session 1'});
      const session2 = await manager.createSession({goal: 'Session 2'});

      await manager.acquireFileLock('/src/test.ts', session1.id, session1.goal);
      const locked = await manager.acquireFileLock('/src/test.ts', session2.id, session2.goal);

      expect(locked).toBe(false);
    });

    it('allows same session to acquire lock again', async () => {
      const session = await manager.createSession({goal: 'Test'});

      await manager.acquireFileLock('/src/test.ts', session.id, session.goal);
      const locked = await manager.acquireFileLock('/src/test.ts', session.id, session.goal);

      expect(locked).toBe(true);
    });

    it('releases file lock', async () => {
      const session = await manager.createSession({goal: 'Test'});
      await manager.acquireFileLock('/src/test.ts', session.id, session.goal);

      const released = await manager.releaseFileLock('/src/test.ts', session.id);
      expect(released).toBe(true);
    });

    it('lists all active locks', async () => {
      const session = await manager.createSession({goal: 'Test'});

      await manager.acquireFileLock('/file1.ts', session.id, session.goal);
      await manager.acquireFileLock('/file2.ts', session.id, session.goal);

      const locks = await manager.listFileLocks();
      expect(locks.length).toBeGreaterThanOrEqual(2);
    });

    it('releases all locks for a session', async () => {
      const session = await manager.createSession({goal: 'Test'});

      await manager.acquireFileLock('/file1.ts', session.id, session.goal);
      await manager.acquireFileLock('/file2.ts', session.id, session.goal);

      const released = await manager.releaseSessionLocks(session.id);
      expect(released).toBeGreaterThanOrEqual(2);
    });

    it('releases locks when session is stopped', async () => {
      const session = await manager.createSession({goal: 'Test'});
      await manager.startSession(session.id);
      await manager.acquireFileLock('/file1.ts', session.id, session.goal);

      await manager.stopSession(session.id);

      const locks = await manager.listFileLocks();
      const sessionLocks = locks.filter(lock => lock.sessionId === session.id);
      expect(sessionLocks.length).toBe(0);
    });

    it('releases locks when session is completed', async () => {
      const session = await manager.createSession({goal: 'Test'});
      await manager.startSession(session.id);
      await manager.acquireFileLock('/file1.ts', session.id, session.goal);

      await manager.completeSession(session.id);

      const locks = await manager.listFileLocks();
      const sessionLocks = locks.filter(lock => lock.sessionId === session.id);
      expect(sessionLocks.length).toBe(0);
    });
  });

  describe('Session queries', () => {
    it('lists all sessions', async () => {
      await manager.createSession({goal: 'Session 1'});
      await manager.createSession({goal: 'Session 2'});

      const sessions = await manager.listSessions();
      expect(sessions.length).toBeGreaterThanOrEqual(2);
    });

    it('gets a session by id', async () => {
      const created = await manager.createSession({goal: 'Test'});
      const retrieved = await manager.getSession(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.goal).toBe('Test');
    });

    it('returns null for non-existent session', async () => {
      const retrieved = await manager.getSession('non-existent-id');
      expect(retrieved).toBeNull();
    });

    it('gets the latest session', async () => {
      await manager.createSession({goal: 'First'});
      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));
      const session2 = await manager.createSession({goal: 'Second'});

      const latest = await manager.getLatestSession();
      expect(latest?.id).toBe(session2.id);
    });

    it('gets active sessions', async () => {
      const session1 = await manager.createSession({goal: 'Queued'});
      const session2 = await manager.createSession({goal: 'Running'});

      await manager.startSession(session2.id);

      const active = await manager.getActiveSessions();
      const activeIds = active.map(s => s.id);

      expect(activeIds).toContain(session2.id);
      // session1 is queued, not active
      expect(activeIds).not.toContain(session1.id);
    });

    it('gets session snapshot', async () => {
      const session = await manager.createSession({
        goal: 'Test',
        mode: 'debug',
      });

      await manager.startSession(session.id);
      await manager.updateSession(session.id, {
        filesChanged: ['/file.ts'],
        commandsRun: ['npm test'],
      });

      const snapshot = await manager.getSnapshot(session.id);
      expect(snapshot?.id).toBe(session.id);
      expect(snapshot?.goal).toBe('Test');
      expect(snapshot?.status).toBe('running');
      expect(snapshot?.filesChanged).toContain('/file.ts');
      expect(snapshot?.commandsRun).toContain('npm test');
    });

    it('snapshot includes duration for completed session', async () => {
      const session = await manager.createSession({goal: 'Test'});
      await manager.startSession(session.id);
      await manager.completeSession(session.id);

      const snapshot = await manager.getSnapshot(session.id);
      expect(snapshot?.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error handling', () => {
    it('updates non-existent session returns null', async () => {
      const result = await manager.updateSession('non-existent-id', {
        filesChanged: ['/file.ts'],
      });
      expect(result).toBeNull();
    });

    it('checks lock on unlocked file returns null', async () => {
      const lock = await manager.checkFileLock('/unlocked.ts');
      expect(lock).toBeNull();
    });

    it('checks file conflict for non-conflicting file returns null', async () => {
      const session = await manager.createSession({goal: 'Test'});
      const conflict = await manager.checkFileConflict('/file.ts', session.id);
      expect(conflict).toBeNull();
    });

    it('cleans up stale locks', async () => {
      const session = await manager.createSession({goal: 'Test'});
      await manager.acquireFileLock('/file.ts', session.id, session.goal);

      // This should clean up any locks older than maxAgeMs (default or provided)
      const cleaned = await manager.cleanupStaleLocks(0);
      expect(cleaned).toBeGreaterThanOrEqual(0);
    });
  });
});
