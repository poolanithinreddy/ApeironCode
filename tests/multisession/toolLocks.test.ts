import {describe, it, expect} from 'vitest';
import path from 'node:path';
import {
  extractToolLockTargets,
  extractFilePathFromInput,
  isSessionActive,
  MODIFYING_TOOLS,
  READ_ONLY_TOOLS,
} from '../../src/multisession/toolLocks.js';

describe('Tool Lock Utilities', () => {
  describe('extractToolLockTargets', () => {
    const cwd = '/project';

    it('should identify edit_file as modifying tool and extract path', () => {
      const result = extractToolLockTargets('edit_file', {path: 'src/app.ts', search: 'foo', replace: 'bar'}, cwd);
      expect(result.shouldLock).toBe(true);
      expect(result.filePaths).toContain(path.resolve(cwd, 'src/app.ts'));
      expect(result.reason).toContain('edit_file');
    });

    it('should identify write_file as modifying tool and extract path', () => {
      const result = extractToolLockTargets('write_file', {path: 'src/index.ts', content: 'code'}, cwd);
      expect(result.shouldLock).toBe(true);
      expect(result.filePaths).toContain(path.resolve(cwd, 'src/index.ts'));
    });

    it('should identify patch_file as modifying tool and extract path', () => {
      const result = extractToolLockTargets('patch_file', {path: 'src/utils.ts', operations: []}, cwd);
      expect(result.shouldLock).toBe(true);
      expect(result.filePaths).toContain(path.resolve(cwd, 'src/utils.ts'));
    });

    it('should identify revert_patch as modifying tool and extract path', () => {
      const result = extractToolLockTargets('revert_patch', {path: 'src/config.ts'}, cwd);
      expect(result.shouldLock).toBe(true);
      expect(result.filePaths).toContain(path.resolve(cwd, 'src/config.ts'));
    });

    it('should not lock read-only tools', () => {
      const readOnlyTools = ['read_file', 'grep', 'glob', 'list_files', 'project_tree', 'git_status'];
      for (const tool of readOnlyTools) {
        const result = extractToolLockTargets(tool, {path: 'src/app.ts'}, cwd);
        expect(result.shouldLock).toBe(false);
        expect(result.reason).toContain('read-only');
      }
    });

    it('should not lock potentially modifying tools (run_command)', () => {
      const result = extractToolLockTargets('run_command', {command: 'rm -rf /'}, cwd);
      expect(result.shouldLock).toBe(false);
      expect(result.reason).toContain('requires explicit');
    });

    it('should not lock unknown tools', () => {
      const result = extractToolLockTargets('unknown_tool', {}, cwd);
      expect(result.shouldLock).toBe(false);
      expect(result.reason).toContain('unknown');
    });

    it('should handle modifying tool with missing path', () => {
      const result = extractToolLockTargets('edit_file', {search: 'foo', replace: 'bar'}, cwd);
      expect(result.shouldLock).toBe(true);
      expect(result.filePaths).toHaveLength(0); // No path extracted
      expect(result.reason).toContain('not resolvable');
    });
  });

  describe('extractFilePathFromInput', () => {
    it('should extract path field', () => {
      const result = extractFilePathFromInput({path: 'src/app.ts'}, 'edit_file');
      expect(result).toBe('src/app.ts');
    });

    it('should extract filePath field', () => {
      const result = extractFilePathFromInput({filePath: 'src/index.ts'}, 'write_file');
      expect(result).toBe('src/index.ts');
    });

    it('should extract file field', () => {
      const result = extractFilePathFromInput({file: 'src/utils.ts'}, 'read_file');
      expect(result).toBe('src/utils.ts');
    });

    it('should return null if no path field found', () => {
      const result = extractFilePathFromInput({content: 'code'}, 'write_file');
      expect(result).toBeNull();
    });

    it('should return null for non-string path values', () => {
      const result = extractFilePathFromInput({path: 123}, 'edit_file');
      expect(result).toBeNull();
    });
  });

  describe('isSessionActive', () => {
    it('should return true for running status', () => {
      expect(isSessionActive('running')).toBe(true);
    });

    it('should return true for paused status', () => {
      expect(isSessionActive('paused')).toBe(true);
    });

    it('should return false for completed status', () => {
      expect(isSessionActive('completed')).toBe(false);
    });

    it('should return false for failed status', () => {
      expect(isSessionActive('failed')).toBe(false);
    });

    it('should return false for stopped status', () => {
      expect(isSessionActive('stopped')).toBe(false);
    });

    it('should return false for queued status', () => {
      expect(isSessionActive('queued')).toBe(false);
    });
  });

  describe('Tool classification', () => {
    it('should have modifying tools set', () => {
      expect(MODIFYING_TOOLS.has('edit_file')).toBe(true);
      expect(MODIFYING_TOOLS.has('write_file')).toBe(true);
      expect(MODIFYING_TOOLS.has('patch_file')).toBe(true);
      expect(MODIFYING_TOOLS.has('revert_patch')).toBe(true);
    });

    it('should have read-only tools set', () => {
      expect(READ_ONLY_TOOLS.has('read_file')).toBe(true);
      expect(READ_ONLY_TOOLS.has('grep')).toBe(true);
      expect(READ_ONLY_TOOLS.has('glob')).toBe(true);
      expect(READ_ONLY_TOOLS.has('list_files')).toBe(true);
    });
  });
});
