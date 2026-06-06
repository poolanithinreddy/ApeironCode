import type {ApprovalRequest} from '../../safety/approvals.js';
import type {ChatMessage, ToolCallRecord, TodoItem} from '../../agent/types.js';
import type {OverallProgress} from '../../agent/loopProgress.js';
import type {RuntimeStateSnapshot, RuntimePhase} from '../../agent/runtimeState.js';
import type {SandboxBackendId} from '../../sandbox/types.js';

export interface AgentEventBase {
  timestamp: string;
  type: string;
}

export interface MessageStartedEvent extends AgentEventBase {
  messageId: string;
  role: ChatMessage['role'];
  type: 'message.started';
}

export interface MessageDeltaEvent extends AgentEventBase {
  delta: string;
  messageId: string;
  type: 'message.delta';
}

export interface MessageCompletedEvent extends AgentEventBase {
  message: ChatMessage;
  type: 'message.completed';
}

export interface StatusUpdatedEvent extends AgentEventBase {
  message: string;
  type: 'status.updated';
}

export interface ToolStartedEvent extends AgentEventBase {
  toolCall: ToolCallRecord;
  type: 'tool.started';
}

export interface ToolOutputEvent extends AgentEventBase {
  message: string;
  outputKind: 'status' | 'stderr' | 'stdout';
  toolCallId?: string;
  type: 'tool.output';
}

export interface ToolCompletedEvent extends AgentEventBase {
  toolCall: ToolCallRecord;
  type: 'tool.completed';
}

export interface ToolFailedEvent extends AgentEventBase {
  toolCall: ToolCallRecord;
  type: 'tool.failed';
}

export interface ApprovalRequestedEvent extends AgentEventBase {
  request: ApprovalRequest;
  type: 'approval.requested';
}

export interface ApprovalCompletedEvent extends AgentEventBase {
  approved: boolean;
  decision: 'approved' | 'auto-approved' | 'denied' | 'rule-allow' | 'rule-deny';
  request: ApprovalRequest;
  type: 'approval.completed';
}

export interface TodoUpdatedEvent extends AgentEventBase {
  todos: TodoItem[];
  type: 'todo.updated';
}

export interface LoopProgressEvent extends AgentEventBase {
  budget: number;
  iteration: number;
  progress: OverallProgress;
  remainingBudget: number;
  type: 'loop.progress';
}

export interface LoopStalledEvent extends AgentEventBase {
  iteration: number;
  progress: OverallProgress;
  reason: string;
  type: 'loop.stalled';
}

export interface SessionSavedEvent extends AgentEventBase {
  sessionId: string;
  transcriptPath: string;
  type: 'session.saved';
}

export interface ErrorEvent extends AgentEventBase {
  message: string;
  scope: string;
  type: 'error';
}

export interface SandboxExecutionStartedEvent extends AgentEventBase {
  backend: SandboxBackendId | 'local';
  command: string;
  containerId?: string;
  cwd: string;
  type: 'sandbox.execution_started';
}

export interface SandboxExecutionProgressEvent extends AgentEventBase {
  containerId?: string;
  isStderr: boolean;
  message: string;
  type: 'sandbox.execution_progress';
}

export interface SandboxExecutionCompletedEvent extends AgentEventBase {
  backend: SandboxBackendId | 'local';
  containerId?: string;
  durationMs: number;
  exitCode: number;
  output: string;
  type: 'sandbox.execution_completed';
}

export interface ContextSelectedEvent extends AgentEventBase {
  fileCount: number;
  files: Array<{path: string; score: number; reason: string[]}>;
  mode?: string;
  omittedFiles?: string[];
  prompt: string;
  relatedFiles?: string[];
  summaryFiles?: string[];
  taskType?: string;
  testFiles?: string[];
  tokenBudgetEstimate?: number;
  type: 'context.selected';
  warnings?: string[];
}

export interface ContextCompressedEvent extends AgentEventBase {
  compressionRatio: number;
  fullFiles: number;
  omittedFiles: number;
  summarizedFiles: number;
  tokenEstimate: number;
  type: 'context.compressed';
}

export interface ToolsExposureSelectedEvent extends AgentEventBase {
  estimatedSchemaTokens: number;
  excludedCount: number;
  includedTools: string[];
  type: 'tools.exposure_selected';
}

export interface RuntimeStateChangedEvent extends AgentEventBase {
  from: RuntimePhase;
  snapshot: RuntimeStateSnapshot;
  to: RuntimePhase;
  type: 'runtime.state_changed';
}

export interface RuntimeCheckpointCreatedEvent extends AgentEventBase {
  checkpointId: string;
  type: 'runtime.checkpoint_created';
}

export interface RuntimeRollbackStartedEvent extends AgentEventBase {
  checkpointId: string;
  type: 'runtime.rollback_started';
}

export interface RuntimeRollbackCompletedEvent extends AgentEventBase {
  checkpointId: string;
  ok: boolean;
  summary: string;
  type: 'runtime.rollback_completed';
}

export interface RuntimeVerificationStartedEvent extends AgentEventBase {
  step: string;
  type: 'runtime.verification_started';
}

export interface RuntimeVerificationCompletedEvent extends AgentEventBase {
  ok: boolean;
  summary: string;
  type: 'runtime.verification_completed';
}

export interface RuntimeRecoveryStartedEvent extends AgentEventBase {
  attempt: number;
  reason: string;
  type: 'runtime.recovery_started';
}

export interface RuntimeRecoveryCompletedEvent extends AgentEventBase {
  ok: boolean;
  summary: string;
  type: 'runtime.recovery_completed';
}

export interface RuntimeCancelledEvent extends AgentEventBase {
  reason: string;
  type: 'runtime.cancelled';
}

export interface ToolOutputCompressedEvent extends AgentEventBase {
  compressedTokenEstimate: number;
  originalTokenEstimate: number;
  toolName: string;
  type: 'tool_output.compressed';
}

export interface ToolCallParsedEvent extends AgentEventBase {
  toolId: string;
  toolName: string;
  type: 'tool_call.parsed';
}

export interface ToolCallRepairedEvent extends AgentEventBase {
  toolId: string;
  toolName: string;
  warnings: string[];
  type: 'tool_call.repaired';
}

export interface ToolCallSchemaValidationFailedEvent extends AgentEventBase {
  feedback: string;
  toolName: string;
  type: 'tool_call.schema_validation_failed';
}

export interface ToolCallRetryRequestedEvent extends AgentEventBase {
  attempts: number;
  toolName: string;
  type: 'tool_call.retry_requested';
}

export interface ToolCallParallelGroupStartedEvent extends AgentEventBase {
  toolNames: string[];
  type: 'tool_call.parallel_group_started';
}

export interface ToolCallParallelGroupCompletedEvent extends AgentEventBase {
  failed: number;
  succeeded: number;
  toolNames: string[];
  type: 'tool_call.parallel_group_completed';
}

export interface ToolResultNormalizedEvent extends AgentEventBase {
  severity: string;
  toolName: string;
  truncated: boolean;
  type: 'tool_result.normalized';
}

export interface ToolSchemaMinifiedEvent extends AgentEventBase {
  toolName: string;
  tokensSaved: number;
  type: 'tool_schema.minified';
}

export interface TokenLedgerUpdatedEvent extends AgentEventBase {
  summary: string;
  totalEstimatedTokens: number;
  type: 'token.ledger_updated';
}

export interface TokenPromptOptimizedEvent extends AgentEventBase {
  optimizedTokens: number;
  originalTokens: number;
  type: 'token.prompt_optimized';
}

export interface TokenHistoryCompactedEvent extends AgentEventBase {
  compactedTokens: number;
  originalTokens: number;
  type: 'token.history_compacted';
}

export interface TokenContextDeltaUsedEvent extends AgentEventBase {
  deltaTokens: number;
  mode?: string;
  type: 'token.context_delta_used';
  useFullContext: boolean;
}

export interface TokenMemoryBudgetAppliedEvent extends AgentEventBase {
  maxTokens: number;
  selectedTokens: number;
  type: 'token.memory_budget_applied';
}

export interface TokenSchemaMinifiedEvent extends AgentEventBase {
  tokensSaved: number;
  type: 'token.schema_minified';
}

export interface TokenToolOutputCompressedEvent extends AgentEventBase {
  compressedTokenEstimate: number;
  originalTokenEstimate: number;
  toolName: string;
  type: 'token.tool_output_compressed';
}

export interface TokenBudgetExceededEvent extends AgentEventBase {
  budget: number;
  category: string;
  observed: number;
  type: 'token.budget_exceeded';
}

export interface LogWrittenEvent extends AgentEventBase {
  level: 'debug' | 'error' | 'info' | 'warn';
  message: string;
  type: 'log.written';
}

export interface TraceCompletedEvent extends AgentEventBase {
  durationMs: number;
  name: string;
  type: 'trace.completed';
}

export interface DoctorCompletedEvent extends AgentEventBase {
  failCount: number;
  passCount: number;
  type: 'doctor.completed';
  warnCount: number;
}

export interface SessionExportedEvent extends AgentEventBase {
  filePath: string;
  format: string;
  sessionId: string;
  type: 'session.exported';
}

export interface CostEstimatedEvent extends AgentEventBase {
  estimatedCostUsd: number | null;
  model: string;
  providerId: string;
  type: 'cost.estimated';
}

export interface DebugSnapshotCreatedEvent extends AgentEventBase {
  kind: 'config' | 'context' | 'logs' | 'tokens' | 'traces';
  type: 'debug.snapshot_created';
}

export interface GitHubAutomationStartedEvent extends AgentEventBase {
  dryRun: boolean;
  issueNumber?: number;
  prNumber?: number;
  ref?: string;
  type: 'github.automation_started';
  workflow: string;
}

export interface GitHubAutomationProgressEvent extends AgentEventBase {
  step: {detail?: string; name: string; status: string};
  type: 'github.automation_progress';
}

export interface GitHubAutomationCompletedEvent extends AgentEventBase {
  dryRun: boolean;
  prNumber?: number;
  type: 'github.automation_completed';
  workflow: string;
}

export interface GitHubAutomationFailedEvent extends AgentEventBase {
  error: string;
  type: 'github.automation_failed';
  workflow: string;
}

// ─── Phase 16D: Background Task + Worktree Events ───────────────────────────

export interface TaskCreatedEvent extends AgentEventBase {
  taskId: string;
  title: string;
  kind: string;
  type: 'task.created';
}

export interface TaskStartedEvent extends AgentEventBase {
  taskId: string;
  type: 'task.started';
}

export interface TaskLogAppendedEvent extends AgentEventBase {
  taskId: string;
  message: string;
  level: 'info' | 'warn' | 'error';
  type: 'task.log_appended';
}

export interface TaskCompletedEvent extends AgentEventBase {
  taskId: string;
  outputSummary?: string;
  type: 'task.completed';
}

export interface TaskFailedEvent extends AgentEventBase {
  taskId: string;
  errorSummary?: string;
  type: 'task.failed';
}

export interface TaskStoppedEvent extends AgentEventBase {
  taskId: string;
  type: 'task.stopped';
}

export interface TaskResumedEvent extends AgentEventBase {
  taskId: string;
  type: 'task.resumed';
}

export interface WorktreeCreatedEvent extends AgentEventBase {
  worktreeId: string;
  branchName: string;
  taskId?: string;
  type: 'worktree.created';
}

export interface WorktreeRemovedEvent extends AgentEventBase {
  worktreeId: string;
  branchName: string;
  type: 'worktree.removed';
}

export type AgentEvent =
  | ApprovalCompletedEvent
  | ApprovalRequestedEvent
  | ContextCompressedEvent
  | ContextSelectedEvent
  | CostEstimatedEvent
  | DebugSnapshotCreatedEvent
  | DoctorCompletedEvent
  | ErrorEvent
  | GitHubAutomationCompletedEvent
  | GitHubAutomationFailedEvent
  | GitHubAutomationProgressEvent
  | GitHubAutomationStartedEvent
  | LogWrittenEvent
  | LoopProgressEvent
  | LoopStalledEvent
  | MessageCompletedEvent
  | MessageDeltaEvent
  | MessageStartedEvent
  | RuntimeCancelledEvent
  | RuntimeCheckpointCreatedEvent
  | RuntimeRecoveryCompletedEvent
  | RuntimeRecoveryStartedEvent
  | RuntimeRollbackCompletedEvent
  | RuntimeRollbackStartedEvent
  | RuntimeStateChangedEvent
  | RuntimeVerificationCompletedEvent
  | RuntimeVerificationStartedEvent
  | SandboxExecutionCompletedEvent
  | SandboxExecutionProgressEvent
  | SandboxExecutionStartedEvent
  | SessionExportedEvent
  | SessionSavedEvent
  | StatusUpdatedEvent
  | TodoUpdatedEvent
  | ToolCompletedEvent
  | ToolFailedEvent
  | ToolOutputCompressedEvent
  | ToolOutputEvent
  | ToolStartedEvent
  | ToolCallParsedEvent
  | ToolCallRepairedEvent
  | ToolCallSchemaValidationFailedEvent
  | ToolCallRetryRequestedEvent
  | ToolCallParallelGroupStartedEvent
  | ToolCallParallelGroupCompletedEvent
  | ToolResultNormalizedEvent
  | ToolSchemaMinifiedEvent
  | TokenBudgetExceededEvent
  | TokenContextDeltaUsedEvent
  | TokenHistoryCompactedEvent
  | TokenLedgerUpdatedEvent
  | TokenMemoryBudgetAppliedEvent
  | TokenPromptOptimizedEvent
  | TokenSchemaMinifiedEvent
  | TokenToolOutputCompressedEvent
  | TraceCompletedEvent
  | ToolsExposureSelectedEvent
  | TaskCreatedEvent
  | TaskStartedEvent
  | TaskLogAppendedEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | TaskStoppedEvent
  | TaskResumedEvent
  | WorktreeCreatedEvent
  | WorktreeRemovedEvent;

export const createEventTimestamp = (): string => new Date().toISOString();
