import type {ProviderUsage} from '../providers/types.js';
import type {ApprovalRequest} from '../safety/approvals.js';
import type {ToolResult} from '../tools/types.js';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';
export type AgentMode = 'autonomous-with-approval' | 'chat' | 'commit' | 'debug' | 'edit' | 'explain' | 'feature' | 'fix' | 'plan' | 'refactor' | 'review' | 'test-fix';

export const AGENT_MODES: AgentMode[] = [
  'autonomous-with-approval',
  'chat',
  'commit',
  'debug',
  'edit',
  'explain',
  'feature',
  'fix',
  'plan',
  'refactor',
  'review',
  'test-fix',
];

export const isAgentMode = (value: string): value is AgentMode => {
  return AGENT_MODES.includes(value as AgentMode);
};

export interface TodoItem {
  content: string;
  id: string;
  note?: string;
  status: 'completed' | 'failed' | 'pending' | 'running';
  updatedAt: string;
}

export interface AgentTaskState {
  activeTaskPlanId?: string;
  commandsRun: string[];
  errors: string[];
  filesChanged: string[];
  filesRead: string[];
  goal: string;
  mode: AgentMode;
  plan: string[];
  startedAt: string;
  summary: string | null;
  testsRun: string[];
  todos: TodoItem[];
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

export interface ToolCallRecord {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  explanation?: string;
  status: 'pending' | 'running' | 'success' | 'error';
  createdAt: string;
  result?: ToolResult;
  error?: string;
  // Permission and audit metadata (optional, populated by UnifiedToolExecutor)
  permissionDecision?: 'allow' | 'deny' | 'approved' | 'rejected' | 'ask';
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  matchedRule?: string;
  durationMs?: number;
}

export interface AgentRunOptions {
  allowModeInference?: boolean;
  mode?: AgentMode;
  planId?: string;
  planOnly?: boolean;
  prompt: string;
  model?: string;
  providerName?: string;
  signal?: AbortSignal;
  agentSessionId?: string;
  skillName?: string;
  /** Show the full execution/debug summary (also via APEIRONCODE_DEBUG=1). */
  verbose?: boolean;
}

export interface AgentCallbacks {
  onMessage?: (message: ChatMessage) => void;
  onStatus?: (status: string) => void;
  onToolCall?: (toolCall: ToolCallRecord) => void;
  onToolResult?: (toolCall: ToolCallRecord) => void;
  onApprovalRequest?: (request: ApprovalRequest) => void;
  onApprovalResolved?: (approved: boolean) => void;
}

export interface AgentRunResult {
  finalMessage: ChatMessage;
  plan?: string | null;
  messages: ChatMessage[];
  taskState?: AgentTaskState;
  toolCalls: ToolCallRecord[];
  usage?: ProviderUsage;
}

export interface ToolDirective {
  toolName: string;
  input: Record<string, unknown>;
  explanation?: string;
}
