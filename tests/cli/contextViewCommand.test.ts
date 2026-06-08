import {describe, expect, it, vi} from 'vitest';

import {buildProgram, type CliHandlers} from '../../src/cli/commands.js';

const stubHandlers = (): CliHandlers => {
  const noop = vi.fn(() => Promise.resolve());
  return new Proxy({} as CliHandlers, {get: () => noop});
};

describe('context view command', () => {
  it('registers context view subcommand', () => {
    const handlers = stubHandlers();
    const program = buildProgram(handlers);
    program.exitOverride();
    const ctx = program.commands.find((c) => c.name() === 'context');
    expect(ctx).toBeDefined();
    const subs = (ctx?.commands ?? []).map((c) => c.name());
    expect(subs).toContain('view');
  });

  it('context view calls contextView handler', async () => {
    const fn = vi.fn(() => Promise.resolve());
    const proxy = new Proxy({} as CliHandlers, {
      get: (_t, name) => (name === 'contextView' ? fn : vi.fn(() => Promise.resolve())),
    });
    const program = buildProgram(proxy);
    program.exitOverride();
    await program.parseAsync(['node', 'apeironcode', 'context', 'view']);
    expect(fn).toHaveBeenCalled();
  });

  it('debug compression subcommand calls debugCompression handler', async () => {
    const fn = vi.fn(() => Promise.resolve());
    const proxy = new Proxy({} as CliHandlers, {
      get: (_t, name) => (name === 'debugCompression' ? fn : vi.fn(() => Promise.resolve())),
    });
    const program = buildProgram(proxy);
    program.exitOverride();
    await program.parseAsync(['node', 'apeironcode', 'debug', 'compression']);
    expect(fn).toHaveBeenCalled();
  });
});
