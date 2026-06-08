import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

const runCli = (
  args: string[],
  options: {cwd?: string; home?: string} = {},
): {output: string; status: number} => {
  const cliPath = path.join(process.cwd(), 'dist/cli/index.js');
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: options.cwd ?? process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: options.home ?? process.env.HOME,
      OPENCODE_HOME: options.home ?? process.env.OPENCODE_HOME,
    },
  });
  return {
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    status: result.status ?? 1,
  };
};

describe('product user flows', () => {
  it('supports first-run mock setup and product-health commands from the built CLI', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-e2e-home-'));
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-e2e-workspace-'));
    try {
      const setup = runCli(['setup', '--provider', 'mock'], {cwd, home});
      expect(setup.status).toBe(0);
      expect(setup.output).toContain('mock');

      const status = runCli(['setup', 'status'], {cwd, home});
      expect(status.output).toContain('Setup status');

      const fallback = runCli(['provider', 'fallback', 'simulate', 'rate-limit'], {cwd, home});
      expect(fallback.output).toContain('Provider fallback simulation: rate-limit');

      const github = runCli(['github', 'status'], {cwd, home});
      expect(github.output).toContain('Connector: github');
      expect(github.output).not.toContain('secret-token');

      const security = runCli(['security', 'status'], {cwd, home});
      expect(security.output).toContain('OS sandboxing: not-enabled');
    } finally {
      await fs.rm(home, {force: true, recursive: true});
      await fs.rm(cwd, {force: true, recursive: true});
    }
  }, 15_000);
});
