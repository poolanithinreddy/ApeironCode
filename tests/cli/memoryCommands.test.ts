import {describe, expect, it, vi} from 'vitest';
import {buildProgram, type CliHandlers} from '../../src/cli/commands.js';

const stubHandlers = (): CliHandlers => {
  const noop = vi.fn(() => Promise.resolve());
  return new Proxy({} as CliHandlers, {
    get: () => noop,
  });
};

const getMemorySubcommands = (): string[] => {
  const program = buildProgram(stubHandlers());
  program.exitOverride();
  const mem = program.commands.find((c) => c.name() === 'memory');
  return (mem?.commands ?? []).map((c) => c.name());
};

describe('memory CLI commands', () => {
  it('registers the memory command group', () => {
    const program = buildProgram(stubHandlers());
    program.exitOverride();
    const mem = program.commands.find((c) => c.name() === 'memory');
    expect(mem).toBeDefined();
  });

  it('includes core existing memory subcommands', () => {
    const subs = getMemorySubcommands();
    expect(subs).toContain('show');
    expect(subs).toContain('search');
    expect(subs).toContain('graph');
    expect(subs).toContain('review');
    expect(subs).toContain('conflicts');
    expect(subs).toContain('stale');
    expect(subs).toContain('why');
    expect(subs).toContain('prune');
    expect(subs).toContain('learn');
  });

  it('includes new 14B.4 memory subcommands', () => {
    const subs = getMemorySubcommands();
    expect(subs).toContain('explain');
    expect(subs).toContain('verify');
    expect(subs).toContain('compact');
    expect(subs).toContain('export');
    expect(subs).toContain('forget');
  });

  it('explain subcommand invokes memoryExplain handler', async () => {
    const fn = vi.fn(() => Promise.resolve());
    const proxy = new Proxy({} as CliHandlers, {
      get: (_t, name) => (name === 'memoryExplain' ? fn : vi.fn(() => Promise.resolve())),
    });
    const program = buildProgram(proxy);
    program.exitOverride();
    await program.parseAsync(['node', 'opencode', 'memory', 'explain', 'fix the auth error']);
    expect(fn).toHaveBeenCalledWith('fix the auth error');
  });

  it('verify subcommand invokes memoryVerify handler', async () => {
    const fn = vi.fn(() => Promise.resolve());
    const proxy = new Proxy({} as CliHandlers, {
      get: (_t, name) => (name === 'memoryVerify' ? fn : vi.fn(() => Promise.resolve())),
    });
    const program = buildProgram(proxy);
    program.exitOverride();
    await program.parseAsync(['node', 'opencode', 'memory', 'verify']);
    expect(fn).toHaveBeenCalled();
  });

  it('compact subcommand invokes memoryCompact handler', async () => {
    const fn = vi.fn(() => Promise.resolve());
    const proxy = new Proxy({} as CliHandlers, {
      get: (_t, name) => (name === 'memoryCompact' ? fn : vi.fn(() => Promise.resolve())),
    });
    const program = buildProgram(proxy);
    program.exitOverride();
    await program.parseAsync(['node', 'opencode', 'memory', 'compact']);
    expect(fn).toHaveBeenCalled();
  });

  it('export subcommand invokes memoryExport handler', async () => {
    const fn = vi.fn(() => Promise.resolve());
    const proxy = new Proxy({} as CliHandlers, {
      get: (_t, name) => (name === 'memoryExport' ? fn : vi.fn(() => Promise.resolve())),
    });
    const program = buildProgram(proxy);
    program.exitOverride();
    await program.parseAsync(['node', 'opencode', 'memory', 'export', '--redacted']);
    expect(fn).toHaveBeenCalled();
  });

  it('forget subcommand invokes memoryForget handler with id', async () => {
    const fn = vi.fn(() => Promise.resolve());
    const proxy = new Proxy({} as CliHandlers, {
      get: (_t, name) => (name === 'memoryForget' ? fn : vi.fn(() => Promise.resolve())),
    });
    const program = buildProgram(proxy);
    program.exitOverride();
    await program.parseAsync(['node', 'opencode', 'memory', 'forget', 'entity-id-123', '--yes']);
    expect(fn).toHaveBeenCalledWith('entity-id-123', expect.objectContaining({yes: true}));
  });
});
