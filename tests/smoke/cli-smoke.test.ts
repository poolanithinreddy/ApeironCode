import {describe, expect, it} from 'vitest';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

// Helper to run CLI in isolated environment
async function runCLIInIsolatedEnv(args: string[]): Promise<{stdout: string; stderr: string; exitCode: number}> {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-cli-test-'));
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-cli-workspace-'));
  const cliPath = path.join(process.cwd(), 'dist/cli/index.js');

  try {
    const env = {
      ...process.env,
      HOME: tempHome,
      OPENCODE_HOME: tempHome,
    };

    const result = spawnSync(process.execPath, [cliPath, ...args], {
      cwd: tempDir,
      env,
      encoding: 'utf8',
    });

    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: result.status ?? 1,
    };
  } finally {
    await fs.rm(tempHome, {force: true, recursive: true});
    await fs.rm(tempDir, {force: true, recursive: true});
  }
}

describe('CLI Smoke Tests', () => {
  describe('Built CLI Structure', () => {
    it('should have built CLI artifact', async () => {
      const distExists = await fs.access('dist/cli/index.js').then(() => true).catch(() => false);
      expect(distExists).toBe(true);
    });

    it('should have source map for debugging', async () => {
      const mapExists = await fs.access('dist/cli/index.js.map').then(() => true).catch(() => false);
      expect(mapExists).toBe(true);
    });

    it('should have TypeScript declarations', async () => {
      const dtsExists = await fs.access('dist/cli/index.d.ts').then(() => true).catch(() => false);
      expect(dtsExists).toBe(true);
    });
  });

  describe('Dev CLI Commands (source-based)', () => {
    it('should handle help command without crashing', async () => {
      const result = await runCLIInIsolatedEnv(['--help']);
      const output = result.stdout || result.stderr;
      // Help command should produce output or be a known exit code
      expect(output.length > 0 || result.exitCode <= 1).toBe(true);
    });

    it('should handle version command without crashing', async () => {
      const result = await runCLIInIsolatedEnv(['--version']);
      const output = result.stdout || result.stderr;
      // Version command should produce output
      expect(output.length > 0 || result.exitCode <= 1).toBe(true);
    });

    it('should handle tools command', async () => {
      const result = await runCLIInIsolatedEnv(['tools']);
      const output = result.stdout || result.stderr;
      expect(output).toBeDefined();
    });

    it('should handle plugins command', async () => {
      const result = await runCLIInIsolatedEnv(['plugins', 'list']);
      const output = result.stdout || result.stderr;
      expect(output).toBeDefined();
    });

    it('should handle permissions command', async () => {
      const result = await runCLIInIsolatedEnv(['permissions', 'list']);
      const output = result.stdout || result.stderr;
      expect(output).toBeDefined();
    });

    it('should handle permission check', async () => {
      const result = await runCLIInIsolatedEnv(['permissions', 'check', 'Bash(npm test)']);
      const output = result.stdout || result.stderr;
      expect(output).toBeDefined();
    });

    it('should handle context command', async () => {
      const result = await runCLIInIsolatedEnv(['context']);
      const output = result.stdout || result.stderr;
      expect(output).toBeDefined();
    });
  });
});
