import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import path from 'node:path';
import {promises as fs} from 'node:fs';
import {MultiAgentSessionManager} from '../../src/multisession/manager.js';
import {FileLockManager} from '../../src/multisession/locks.js';

describe('File Lock Integration', () => {
  let tempDir: string;
  let sessionManager: MultiAgentSessionManager;
  let lockManager: FileLockManager;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = path.join(process.cwd(), `.test-sessions-${Date.now()}`);
    await fs.mkdir(tempDir, {recursive: true});

    sessionManager = new MultiAgentSessionManager(tempDir);
    lockManager = new FileLockManager(tempDir);
  });

  afterEach(async () => {
    // Cleanup
    await lockManager.clear();
    try {
      await fs.rm(tempDir, {recursive: true});
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Lock Acquisition and Conflict Detection', () => {
    it('should acquire lock for first session on a file', async () => {
      const filePath = path.join(tempDir, 'test.ts');
      const sessionId = 'session-1';

      const acquired = await lockManager.acquireLock(filePath, sessionId, 'Test goal');
      expect(acquired).toBe(true);

      const lock = await lockManager.isLocked(filePath);
      expect(lock).not.toBeNull();
      expect(lock?.sessionId).toBe(sessionId);
    });

    it('should prevent lock acquisition by different session', async () => {
      const filePath = path.join(tempDir, 'test.ts');

      await lockManager.acquireLock(filePath, 'session-1', 'Goal 1');
      const acquired = await lockManager.acquireLock(filePath, 'session-2', 'Goal 2');

      expect(acquired).toBe(false);
    });

    it('should allow same session to refresh lock', async () => {
      const filePath = path.join(tempDir, 'test.ts');
      const sessionId = 'session-1';

      await lockManager.acquireLock(filePath, sessionId, 'Goal 1');
      const refreshed = await lockManager.acquireLock(filePath, sessionId, 'Goal 1 updated');

      expect(refreshed).toBe(true);
    });

    it('should detect conflict for different session', async () => {
      const filePath = path.join(tempDir, 'test.ts');

      await lockManager.acquireLock(filePath, 'session-1', 'Goal 1');
      const conflict = await lockManager.checkConflicts(filePath, 'session-2');

      expect(conflict).not.toBeNull();
      expect(conflict?.sessionId).toBe('session-1');
    });

    it('should not report conflict for same session', async () => {
      const filePath = path.join(tempDir, 'test.ts');
      const sessionId = 'session-1';

      await lockManager.acquireLock(filePath, sessionId, 'Goal 1');
      const conflict = await lockManager.checkConflicts(filePath, sessionId);

      expect(conflict).toBeNull();
    });
  });

  describe('Lock Release', () => {
    it('should release lock for specific session', async () => {
      const filePath = path.join(tempDir, 'test.ts');
      const sessionId = 'session-1';

      await lockManager.acquireLock(filePath, sessionId, 'Goal');
      const released = await lockManager.releaseLock(filePath, sessionId);

      expect(released).toBe(true);

      const lock = await lockManager.isLocked(filePath);
      expect(lock).toBeNull();
    });

    it('should release all locks for a session', async () => {
      const file1 = path.join(tempDir, 'file1.ts');
      const file2 = path.join(tempDir, 'file2.ts');
      const sessionId = 'session-1';

      await lockManager.acquireLock(file1, sessionId, 'Goal');
      await lockManager.acquireLock(file2, sessionId, 'Goal');

      const count = await lockManager.releaseAllForSession(sessionId);

      expect(count).toBe(2);

      const lock1 = await lockManager.isLocked(file1);
      const lock2 = await lockManager.isLocked(file2);

      expect(lock1).toBeNull();
      expect(lock2).toBeNull();
    });
  });

  describe('Session Lock Lifecycle', () => {
    it('should track filesLocked in session record', async () => {
      const session = await sessionManager.createSession({
        goal: 'Test task',
        mode: 'edit',
      });

      const filePath = path.join(tempDir, 'test.ts');
      await sessionManager.acquireFileLock(filePath, session.id, 'Goal');

      // Update session with locked files
      const updated = await sessionManager.updateSession(session.id, {
        filesLocked: [filePath],
      });

      expect(updated?.filesLocked).toContain(filePath);
    });

    it('should release all session locks when stopping', async () => {
      const session = await sessionManager.createSession({
        goal: 'Test task',
        mode: 'edit',
      });

      const file1 = path.join(tempDir, 'file1.ts');
      const file2 = path.join(tempDir, 'file2.ts');

      await sessionManager.acquireFileLock(file1, session.id, 'Goal');
      await sessionManager.acquireFileLock(file2, session.id, 'Goal');

      await sessionManager.stopSession(session.id);

      const lock1 = await lockManager.isLocked(file1);
      const lock2 = await lockManager.isLocked(file2);

      expect(lock1).toBeNull();
      expect(lock2).toBeNull();
    });

    it('should release all session locks when completing', async () => {
      const session = await sessionManager.createSession({
        goal: 'Test task',
        mode: 'edit',
      });

      const filePath = path.join(tempDir, 'test.ts');
      await sessionManager.acquireFileLock(filePath, session.id, 'Goal');

      await sessionManager.completeSession(session.id);

      const lock = await lockManager.isLocked(filePath);
      expect(lock).toBeNull();
    });

    it('should release all session locks when failing', async () => {
      const session = await sessionManager.createSession({
        goal: 'Test task',
        mode: 'edit',
      });

      const filePath = path.join(tempDir, 'test.ts');
      await sessionManager.acquireFileLock(filePath, session.id, 'Goal');

      await sessionManager.failSession(session.id, 'Test error');

      const lock = await lockManager.isLocked(filePath);
      expect(lock).toBeNull();
    });
  });

  describe('Multiple Sessions', () => {
    it('should track locks for different sessions independently', async () => {
      const session1 = await sessionManager.createSession({goal: 'Task 1'});
      const session2 = await sessionManager.createSession({goal: 'Task 2'});

      const file1 = path.join(tempDir, 'file1.ts');
      const file2 = path.join(tempDir, 'file2.ts');

      // Session 1 locks file1
      await sessionManager.acquireFileLock(file1, session1.id, 'Task 1');

      // Session 2 locks file2
      await sessionManager.acquireFileLock(file2, session2.id, 'Task 2');

      // Session 1 cannot lock file1 (already has it)
      const conflict1 = await sessionManager.checkFileConflict(file1, session1.id);
      expect(conflict1).toBeNull();

      // Session 2 cannot lock file1 (held by session1)
      const conflict2 = await sessionManager.checkFileConflict(file1, session2.id);
      expect(conflict2).not.toBeNull();

      // Session 2 cannot lock file2 (already has it)
      const conflict3 = await sessionManager.checkFileConflict(file2, session2.id);
      expect(conflict3).toBeNull();
    });
  });
});
