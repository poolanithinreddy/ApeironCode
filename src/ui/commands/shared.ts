import type {Agent} from '../../agent/Agent.js';
import type {AgentMode} from '../../agent/types.js';
import type {ConfigStore, ResolvedConfig} from '../../config/config.js';
import type {ProviderRegistry} from '../../providers/registry.js';
import type {SessionStore} from '../../sessions/store.js';
import type {ToolRegistry} from '../../tools/registry.js';
import type {DashboardView} from '../dashboardTypes.js';

export interface SlashCommandContext {
  agent: Agent;
  appendLocalAssistantMessage: (content: string) => void;
  configStore: ConfigStore;
  cwd: string;
  exit: () => void;
  getCodeIntelligenceSummary?: () => string | null;
  getCurrentMode: () => AgentMode;
  getResolvedConfig: () => ResolvedConfig;
  providerRegistry: ProviderRegistry;
  refreshConfig: () => Promise<void>;
  refreshSessionState: () => void;
  runPrompt: (prompt: string, mode?: AgentMode) => Promise<void>;
  runTool: (toolName: string, input: Record<string, unknown>) => Promise<void>;
  sessionStore: SessionStore;
  setDashboard: (view: DashboardView | null) => void;
  /** Expand the auto compact home into the full workspace dashboard. */
  expandHome?: () => void;
  setCurrentMode: (mode: AgentMode) => void;
  setMemoryInputMode: (mode: 'append' | 'replace' | null) => void;
  setStatus: (status: string) => void;
  toolRegistry: ToolRegistry;
}

export interface SlashCommandDefinition {
  category?: string;
  description: string;
  examples?: string[];
  name: string;
  status?: 'approval-gated' | 'experimental' | 'read-only' | 'requires-setup' | 'stable';
  usage: string;
  run: (args: string[], context: SlashCommandContext) => void | Promise<void>;
}

let slashDefinitionsProvider: () => SlashCommandDefinition[] = () => [];

export const setSlashDefinitionsProvider = (provider: () => SlashCommandDefinition[]): void => {
  slashDefinitionsProvider = provider;
};

export const getSlashDefinitions = (): SlashCommandDefinition[] => slashDefinitionsProvider();

export {
  formatSlashMissingTaskMessage,
  resolveSlashTask,
} from './helpers.js';
export {
  appendSlashMessage,
  filterSlashCommandCatalog,
  findSlashCommandDefinition,
  formatSlashCommandCatalog,
  formatSlashCommandCompact,
  formatSlashCommandDetails,
} from './format.js';
export {
  normalizeModelRole,
  normalizeNaturalSlashInput,
  parseCostArguments,
  parseHistoryArguments,
  parseSearchArguments,
} from './parser.js';
