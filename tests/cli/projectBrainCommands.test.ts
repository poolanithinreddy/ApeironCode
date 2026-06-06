import {describe, expect, it, vi} from 'vitest';

import {buildProgram, type CliHandlers} from '../../src/cli/commands.js';

const handlers = (): CliHandlers => {
  const cache = new Map<string | symbol, ReturnType<typeof vi.fn>>();
  return new Proxy({} as CliHandlers, {
    get: (_target, prop) => {
      if (!cache.has(prop)) cache.set(prop, vi.fn(() => Promise.resolve()));
      return cache.get(prop);
    },
  });
};

describe('Project Brain CLI commands', () => {
  it('routes brain plan without approval flags', async () => {
    const h = handlers();
    const program = buildProgram(h);
    await program.parseAsync(['node', 'apeironcode', 'brain', 'plan']);
    expect(h.brainPlan).toHaveBeenCalled();
  });

  it('routes brain init approval explicitly', async () => {
    const h = handlers();
    const program = buildProgram(h);
    await program.parseAsync(['node', 'apeironcode', 'brain', 'init', '--yes']);
    expect(h.brainInit).toHaveBeenCalledWith(expect.objectContaining({yes: true}));
  });

  it('routes status, show, tasks, memory, and update', async () => {
    const h = handlers();
    const program = buildProgram(h);
    await program.parseAsync(['node', 'apeironcode', 'brain', 'status']);
    await program.parseAsync(['node', 'apeironcode', 'brain', 'show']);
    await program.parseAsync(['node', 'apeironcode', 'brain', 'tasks']);
    await program.parseAsync(['node', 'apeironcode', 'brain', 'memory']);
    await program.parseAsync(['node', 'apeironcode', 'brain', 'update', '--yes', '--summary', 'done']);
    expect(h.brainStatus).toHaveBeenCalled();
    expect(h.brainShow).toHaveBeenCalled();
    expect(h.brainTasks).toHaveBeenCalled();
    expect(h.brainMemory).toHaveBeenCalled();
    expect(h.brainUpdate).toHaveBeenCalledWith(expect.objectContaining({summary: 'done', yes: true}));
  });
});
