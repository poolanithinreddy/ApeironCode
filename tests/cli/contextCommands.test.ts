import {describe, expect, it, vi} from 'vitest';
import {buildProgram, type CliHandlers} from '../../src/cli/commands.js';

const stubHandlers = (): CliHandlers => {
  const noop = vi.fn(() => Promise.resolve());
  return new Proxy({} as CliHandlers, {
    get: () => noop,
  });
};

describe('context CLI commands', () => {
  it('registers context plan / affected / tests subcommands', () => {
    const handlers = stubHandlers();
    const program = buildProgram(handlers);
    program.exitOverride();
    const ctx = program.commands.find((c) => c.name() === 'context');
    expect(ctx).toBeDefined();
    const subs = (ctx?.commands ?? []).map((c) => c.name());
    expect(subs).toContain('plan');
    expect(subs).toContain('affected');
    expect(subs).toContain('tests');
    expect(subs).toContain('map');
    expect(subs).toContain('symbols');
  });

  it('plan subcommand takes a prompt argument and calls handler', async () => {
    const fn = vi.fn(() => Promise.resolve());
    const proxy = new Proxy({} as CliHandlers, {
      get: (_t, name) => (name === 'contextPlan' ? fn : vi.fn(() => Promise.resolve())),
    });
    const program = buildProgram(proxy);
    program.exitOverride();
    await program.parseAsync(['node', 'opencode', 'context', 'plan', 'fix the failing test']);
    expect(fn).toHaveBeenCalledWith('fix the failing test');
  });
});
