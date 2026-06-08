import {describe, expect, it} from 'vitest';

import {parseShellCommand} from '../../../src/safety/shell/parseCommand.js';

describe('parseShellCommand', () => {
  it('parses a simple command', () => {
    const cmd = parseShellCommand('ls -la');
    expect(cmd.baseCommand).toBe('ls');
    expect(cmd.args).toEqual(['-la']);
    expect(cmd.chains).toEqual([]);
  });

  it('parses chained commands with &&', () => {
    const cmd = parseShellCommand('npm test && npm build');
    expect(cmd.baseCommand).toBe('npm');
    expect(cmd.chains).toHaveLength(1);
    expect(cmd.chains[0]?.operator).toBe('&&');
    expect(cmd.chains[0]?.command.baseCommand).toBe('npm');
  });

  it('parses pipes', () => {
    const cmd = parseShellCommand('cat file.txt | grep foo');
    expect(cmd.baseCommand).toBe('cat');
    expect(cmd.chains).toHaveLength(1);
    expect(cmd.chains[0]?.operator).toBe('|');
    expect(cmd.chains[0]?.command.baseCommand).toBe('grep');
  });

  it('detects redirect >', () => {
    const cmd = parseShellCommand('echo hi > out.txt');
    expect(cmd.redirects.some((r) => r.kind === '>')).toBe(true);
  });

  it('detects env assignments', () => {
    const cmd = parseShellCommand('NODE_ENV=prod node server.js');
    expect(cmd.envAssignments.NODE_ENV).toBe('prod');
    expect(cmd.baseCommand).toBe('node');
  });

  it('detects command substitution', () => {
    const cmd = parseShellCommand('echo $(cat .env)');
    expect(cmd.hasCommandSubstitution).toBe(true);
    expect(cmd.subshells.length).toBeGreaterThan(0);
  });

  it('preserves quoted args', () => {
    const cmd = parseShellCommand('git commit -m "fix: hello world"');
    expect(cmd.baseCommand).toBe('git');
    expect(cmd.args).toContain('fix: hello world');
  });

  it('detects network commands', () => {
    const cmd = parseShellCommand('curl https://example.com');
    expect(cmd.hasNetworkCommand).toBe(true);
  });

  it('detects package managers', () => {
    const cmd = parseShellCommand('npm install axios');
    expect(cmd.hasPackageManager).toBe(true);
  });

  it('detects destructive commands', () => {
    const cmd = parseShellCommand('rm -rf /tmp/foo');
    expect(cmd.hasDestructive).toBe(true);
  });
});
