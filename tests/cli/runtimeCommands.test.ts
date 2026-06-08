import {describe, expect, it, vi} from 'vitest';
import {buildProgram, type CliHandlers} from '../../src/cli/commands.js';

const stubHandlers = (): CliHandlers => {
  const noop = vi.fn(() => Promise.resolve());
  return new Proxy({} as CliHandlers, {
    get: () => noop,
  });
};

describe('runtime CLI commands', () => {
  it('registers runtime subcommands', () => {
    const handlers = stubHandlers();
    const program = buildProgram(handlers);
    program.exitOverride();
    const runtime = program.commands.find((c) => c.name() === 'runtime');
    expect(runtime).toBeDefined();
    const subs = (runtime?.commands ?? []).map((c) => c.name());
    expect(subs).toContain('status');
    expect(subs).toContain('checkpoints');
    expect(subs).toContain('rollback');
    expect(subs).toContain('summary');
  });

  it('runtime status calls runtimeStatus handler', async () => {
    const fn = vi.fn(() => Promise.resolve());
    const proxy = new Proxy({} as CliHandlers, {
      get: (_t, name) => (name === 'runtimeStatus' ? fn : vi.fn(() => Promise.resolve())),
    });
    const program = buildProgram(proxy);
    program.exitOverride();
    await program.parseAsync(['node', 'opencode', 'runtime', 'status']);
    expect(fn).toHaveBeenCalled();
  });

  it('runtime checkpoints calls runtimeCheckpoints handler', async () => {
    const fn = vi.fn(() => Promise.resolve());
    const proxy = new Proxy({} as CliHandlers, {
      get: (_t, name) => (name === 'runtimeCheckpoints' ? fn : vi.fn(() => Promise.resolve())),
    });
    const program = buildProgram(proxy);
    program.exitOverride();
    await program.parseAsync(['node', 'opencode', 'runtime', 'checkpoints']);
    expect(fn).toHaveBeenCalled();
  });

  it('runtime rollback passes checkpointId and --yes flag', async () => {
    const fn = vi.fn(() => Promise.resolve());
    const proxy = new Proxy({} as CliHandlers, {
      get: (_t, name) => (name === 'runtimeRollback' ? fn : vi.fn(() => Promise.resolve())),
    });
    const program = buildProgram(proxy);
    program.exitOverride();
    await program.parseAsync(['node', 'opencode', 'runtime', 'rollback', 'cp-abc-123', '--yes']);
    expect(fn).toHaveBeenCalledWith('cp-abc-123', {yes: true});
  });

  it('runtime summary without sessionId calls runtimeSummary with undefined', async () => {
    const fn = vi.fn(() => Promise.resolve());
    const proxy = new Proxy({} as CliHandlers, {
      get: (_t, name) => (name === 'runtimeSummary' ? fn : vi.fn(() => Promise.resolve())),
    });
    const program = buildProgram(proxy);
    program.exitOverride();
    await program.parseAsync(['node', 'opencode', 'runtime', 'summary']);
    expect(fn).toHaveBeenCalledWith(undefined);
  });

  it('runtime summary with sessionId passes it to handler', async () => {
    const fn = vi.fn(() => Promise.resolve());
    const proxy = new Proxy({} as CliHandlers, {
      get: (_t, name) => (name === 'runtimeSummary' ? fn : vi.fn(() => Promise.resolve())),
    });
    const program = buildProgram(proxy);
    program.exitOverride();
    await program.parseAsync(['node', 'opencode', 'runtime', 'summary', 'sess-xyz']);
    expect(fn).toHaveBeenCalledWith('sess-xyz');
  });
});
