#!/usr/bin/env node
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const repoRoot = process.cwd();
const tempHome = mkdtempSync(path.join(tmpdir(), 'apeironcode-tui-smoke-'));
const env = {
  ...process.env,
  HOME: tempHome,
  APEIRONCODE_UX_HOME: tempHome,
};

const commands = [
  '/commands beginner',
  '/dashboard',
  '/skills',
  '/skill browser',
  '/memory review',
  '/provider fallback simulate rate-limit',
  '/github status',
  '/security status',
  '/help',
];

console.log(`ApeironCode TUI smoke HOME: ${tempHome}`);
console.log('Suggested manual commands:');
for (const command of commands) {
  console.log(`  ${command}`);
}

if (process.argv.includes('--print-only')) {
  process.exit(0);
}

const setup = spawnSync('node', ['dist/cli/index.js', 'setup', '--provider', 'mock'], {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
});
if (setup.status !== 0) {
  process.exit(setup.status ?? 1);
}

const tui = spawnSync('node', ['dist/cli/index.js'], {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
});
process.exit(tui.status ?? 0);
