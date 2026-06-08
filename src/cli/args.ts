import type {AgentMode} from '../agent/types.js';
import type {ApprovalMode, ConfigKey} from '../config/config.js';

export interface RootCliOptions {
  approvalMode?: ApprovalMode;
  dangerouslySkipApprovals?: boolean;
  executePlan?: string;
  model?: string;
  mode?: AgentMode;
  plan?: boolean;
  planOnly?: boolean;
  provider?: string;
  resume?: string;
  welcome?: boolean;
}

export interface ConfigSetOptions {
  provider?: string;
}

export interface DoctorCliOptions {
  fix?: boolean;
  report?: boolean;
  providerCheck?: boolean;
  strict?: boolean;
}

export interface CostCliOptions {
  all?: boolean;
  project?: boolean;
  session?: string;
}

export interface ContextRefreshCliOptions {
  force?: boolean;
}

export interface RevertCliOptions {
  file?: string;
}

export interface ProviderTestCliOptions {
  baseUrl?: string;
  model?: string;
  provider?: string;
  strict?: boolean;
}

export interface HistoryCliOptions {
  all?: boolean;
  file?: string;
  limit?: number;
  session?: string;
}

export interface SessionCliOptions {
  all?: boolean;
}

export interface SearchCliOptions {
  all?: boolean;
  limit?: number;
  scope?: 'all' | 'edit' | 'memory' | 'session' | 'task';
}

export interface MemoryOptions {
  global?: boolean;
  project?: boolean;
}

export interface MemoryAddOptions extends MemoryOptions {
  section?: string;
}

export interface LspCliOptions {
  file?: string;
  language?: string;
}

export type ConfigCommandKey = ConfigKey;
