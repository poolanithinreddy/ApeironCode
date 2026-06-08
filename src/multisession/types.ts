import type {AgentMode} from '../agent/types.js';

export type AgentSessionStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped';

export interface AgentSessionRecord {
  id: string;
  projectRoot: string;
  goal: string;
  status: AgentSessionStatus;
  mode?: AgentMode;
  provider?: string;
  model?: string;
  linkedTaskId?: string;
  linkedConversationId?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  stoppedAt?: string;
  error?: string;
  filesLocked: string[];
  filesChanged: string[];
  commandsRun: string[];
  testsRun: string[];
  summary?: string;
  // Background worker metadata (Phase 7)
  workerPid?: number;
  workerStartedAt?: string;
  workerCommand?: string;
  workerStatus?: 'spawned' | 'running' | 'completed' | 'failed' | 'stopped' | 'unknown';
}

export interface AgentSessionSnapshot {
  id: string;
  goal: string;
  status: AgentSessionStatus;
  mode?: AgentMode;
  filesLocked: string[];
  filesChanged: string[];
  commandsRun: string[];
  testsRun: string[];
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  progress?: string;
}

export interface CreateSessionOptions {
  goal: string;
  mode?: AgentMode;
  provider?: string;
  model?: string;
}

export interface UpdateSessionOptions {
  filesChanged?: string[];
  commandsRun?: string[];
  testsRun?: string[];
  filesLocked?: string[];
  summary?: string;
}
