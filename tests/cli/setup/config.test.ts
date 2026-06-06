import {describe, expect, it, vi} from 'vitest';

import {createBootstrapConfigStore, loadBootstrapConfig} from '../../../src/cli/setup/config.js';
import {createBootstrapHandlers} from '../../../src/cli/setup/helpers.js';
import {initializeProviderRegistry} from '../../../src/cli/setup/providers.js';
import {createBootstrapSessionStore, createBootstrapTaskStore, loadBootstrapSession} from '../../../src/cli/setup/session.js';
import {initializeToolRegistry, validateToolRegistry} from '../../../src/cli/setup/tools.js';
import {createCliProgram, createUiLaunchState} from '../../../src/cli/setup/ui.js';
import {installSignalHandlers} from '../../../src/cli/setup/signals.js';
import {createMockConfig} from '../../support/mocks.js';

describe('cli setup modules', () => {
  it('loads config through the injected store', async () => {
    const effective = createMockConfig();
    const config = {effective, ignorePatterns: [], project: {}, projectMemory: null, user: effective};
    const store = {load: vi.fn(() => Promise.resolve(config))};

    await expect(loadBootstrapConfig({cwd: '/tmp/project', configStore: store as never})).resolves.toBe(config);
    expect(store.load).toHaveBeenCalledTimes(1);
  });

  it('creates concrete bootstrap stores for cwd-scoped setup', () => {
    expect(createBootstrapConfigStore('/tmp/project')).toBeDefined();
    expect(createBootstrapSessionStore()).toBeDefined();
    expect(createBootstrapTaskStore('/tmp/project')).toBeDefined();
  });

  it('initializes provider and tool registries', () => {
    expect(initializeProviderRegistry().has('mock')).toBe(true);
    const toolRegistry = initializeToolRegistry();
    expect(toolRegistry.get('read_file').name).toBe('read_file');
    const validation = validateToolRegistry(toolRegistry);
    expect(validation.ok).toBe(true);
    expect(validation.toolCount).toBeGreaterThan(0);
  });

  it('loads optional resume sessions through the injected store', async () => {
    const session = {id: 'session-1'};
    const store = {load: vi.fn(() => Promise.resolve(session))};

    await expect(loadBootstrapSession('session-1', store as never)).resolves.toBe(session);
    await expect(loadBootstrapSession(undefined, store as never)).resolves.toBeNull();
  });

  it('builds UI launch state without side effects', () => {
    const effective = createMockConfig();
    const config = {effective, ignorePatterns: [], project: {}, projectMemory: null, user: effective};

    expect(createUiLaunchState('/tmp/project', config, true)).toEqual({
      config,
      cwd: '/tmp/project',
      needsSetup: true,
    });
  });

  it('composes CLI handlers and program through setup modules', () => {
    const context = {
      configStore: {load: vi.fn()} as never,
      cwd: '/tmp/project',
      sessionStore: {} as never,
      taskStore: {} as never,
    };
    const handlers = createBootstrapHandlers(context);
    const program = createCliProgram(handlers);

    expect(handlers.runRoot).toBeTypeOf('function');
    expect(handlers.providerList).toBeTypeOf('function');
    expect(program.name()).toBe('apeironcode');
  });

  it('installs disposable signal handlers', () => {
    const onSignal = vi.fn();
    const cleanup = installSignalHandlers(onSignal);

    cleanup.dispose();

    expect(onSignal).not.toHaveBeenCalled();
  });
});
