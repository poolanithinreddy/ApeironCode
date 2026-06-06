/**
 * Background task data model for ApeironCode Phase 16D.
 * Distinct from the existing TaskPlan/TaskStore (plan-based) system.
 * These tasks are local-only, no daemon, no remote execution.
 */

export type BgTaskStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'succeeded'
  | 'failed'
  | 'stopped'
  | 'cancelled';

export type BgTaskKind = 'agent' | 'shell' | 'review' | 'test-fix' | 'workflow';

export type BgTaskIsolation = 'none' | 'worktree';

export interface BgTaskLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface BgTask {
  id: string;
  title: string;
  kind: BgTaskKind;
  status: BgTaskStatus;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;

  /** The prompt/goal that drives this task. */
  prompt?: string;
  /** Shell command (for kind=shell tasks). */
  command?: string;
  /** Markdown agent name (for kind=agent tasks). */
  agentName?: string;
  /** Skill names to inject. */
  skillNames?: string[];
  /** Markdown command name (for kind=workflow tasks). */
  workflowCommandName?: string;

  isolation: BgTaskIsolation;
  worktreePath?: string;
  branchName?: string;
  parentBranch?: string;

  /** Last N log lines (truncated for safety). */
  logs: BgTaskLog[];
  outputSummary?: string;
  errorSummary?: string;
  checkpointId?: string;

  /** Free-form safe metadata. */
  metadata?: Record<string, string | number | boolean>;
}

export type BgTaskFilter = {
  status?: BgTaskStatus | BgTaskStatus[];
  kind?: BgTaskKind | BgTaskKind[];
};

const MAX_LOGS = 200;
const MAX_LOG_MESSAGE_LENGTH = 500;

export const truncateLog = (message: string): string =>
  message.length > MAX_LOG_MESSAGE_LENGTH
    ? message.slice(0, MAX_LOG_MESSAGE_LENGTH) + '…'
    : message;

export const appendLog = (task: BgTask, log: BgTaskLog): BgTask => {
  const logs = [...task.logs, {...log, message: truncateLog(log.message)}];
  return {
    ...task,
    logs: logs.length > MAX_LOGS ? logs.slice(logs.length - MAX_LOGS) : logs,
    updatedAt: new Date().toISOString(),
  };
};

const STATUS_EMOJI: Record<BgTaskStatus, string> = {
  queued: '⏳',
  running: '▶',
  paused: '⏸',
  succeeded: '✓',
  failed: '✗',
  stopped: '■',
  cancelled: '✕',
};

export const formatTaskSummary = (task: BgTask): string => {
  const emoji = STATUS_EMOJI[task.status];
  const when = task.updatedAt.slice(0, 16).replace('T', ' ');
  const isolation = task.isolation === 'worktree' ? ' [worktree]' : '';
  return `${emoji} ${task.id.slice(0, 8)} [${task.kind}${isolation}] ${task.title} — ${task.status} @ ${when}`;
};

export const formatTaskList = (tasks: BgTask[]): string => {
  if (tasks.length === 0) return 'No background tasks.';
  return tasks.map(formatTaskSummary).join('\n');
};

export const isResumableStatus = (status: BgTaskStatus): boolean =>
  status === 'paused' || status === 'stopped';

export const isTerminalStatus = (status: BgTaskStatus): boolean =>
  status === 'succeeded' || status === 'failed' || status === 'cancelled';
