import {createBootstrapConfigStore} from './config.js';
import {createBootstrapHandlers} from './helpers.js';
import {initializeProviderRegistry, validateProviderRegistry} from './providers.js';
import type {BootstrapRuntimeContext} from './runtimeContext.js';
import {createBootstrapSessionStore, createBootstrapTaskStore} from './session.js';
import {initializeToolRegistry, validateToolRegistry} from './tools.js';
import {createCliProgram} from './ui.js';
import {migrateLegacyAppHome} from '../../utils/paths.js';

export const runCli = async (): Promise<void> => {
  // Migrate a legacy `~/.opencode-agent` home to the ApeironCode-branded
  // `~/.apeironcode-agent` home before anything reads or writes config, so
  // all user-facing paths and new writes are ApeironCode-first.
  migrateLegacyAppHome();
  const cwd = process.cwd();
  const providerRegistry = initializeProviderRegistry();
  const toolRegistry = initializeToolRegistry();
  validateProviderRegistry(providerRegistry);
  validateToolRegistry(toolRegistry);

  const context: BootstrapRuntimeContext = {
    configStore: createBootstrapConfigStore(cwd),
    cwd,
    sessionStore: createBootstrapSessionStore(),
    taskStore: createBootstrapTaskStore(cwd),
  };
  const program = createCliProgram(createBootstrapHandlers(context));
  await program.parseAsync(process.argv);
};
