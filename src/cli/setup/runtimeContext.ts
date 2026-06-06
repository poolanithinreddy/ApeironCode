import type {ConfigStore} from '../../config/config.js';
import type {SessionStore} from '../../sessions/store.js';
import type {TaskStore} from '../../tasks/taskStore.js';

export interface BootstrapRuntimeContext {
  configStore: ConfigStore;
  cwd: string;
  sessionStore: SessionStore;
  taskStore: TaskStore;
}
