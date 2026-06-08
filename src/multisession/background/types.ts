export type WorkerStatus = 'spawned' | 'running' | 'completed' | 'failed' | 'stopped' | 'unknown';

export interface WorkerMetadata {
  workerPid?: number;
  workerStartedAt?: string;
  workerCommand?: string;
  workerStatus?: WorkerStatus;
}

export interface AgentSessionEvent {
  id: string;
  sessionId: string;
  type: string;
  timestamp: string;
  message?: string;
  data?: Record<string, unknown>;
}

export type AgentSessionEventType =
  | 'session_started'
  | 'session_queued'
  | 'status_changed'
  | 'tool_started'
  | 'tool_completed'
  | 'tool_failed'
  | 'file_locked'
  | 'file_changed'
  | 'command_run'
  | 'test_run'
  | 'permission_decision'
  | 'summary_updated'
  | 'session_completed'
  | 'session_failed'
  | 'session_stopped'
  | 'worker_started'
  | 'lock_released';

export interface LogStreamOptions {
  tail?: number;
  follow?: boolean;
  timeout?: number;
}
