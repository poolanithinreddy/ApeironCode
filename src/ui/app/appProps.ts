import type {ConversationSession} from '../../agent/session.js';
import type {AgentMode} from '../../agent/types.js';
import type {ConfigStore, ResolvedConfig} from '../../config/config.js';
import type {ProviderRegistry} from '../../providers/registry.js';
import type {ToolRegistry} from '../../tools/registry.js';

export interface AppProps {
  configStore: ConfigStore;
  cwd: string;
  initialConfig: ResolvedConfig;
  initialMode?: AgentMode;
  initialSession?: ConversationSession | null;
  needsSetup: boolean;
  providerRegistry: ProviderRegistry;
  toolRegistry: ToolRegistry;
}
