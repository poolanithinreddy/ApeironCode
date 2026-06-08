import type {ZodTypeAny} from 'zod';

import type {AgentTaskState} from '../agent/types.js';
import type {ApeironCodeConfig} from '../config/config.js';
import type {EventBus} from '../core/events/bus.js';
import type {ApprovalManager} from '../safety/approvals.js';
import type {RiskLevel} from '../safety/policy.js';

export interface ToolEvent {
  kind: 'stdout' | 'stderr' | 'status';
  message: string;
}

export interface ToolExecutionContext {
  cwd: string;
  config: ApeironCodeConfig;
  approvalManager: ApprovalManager;
  eventBus?: EventBus;
  sessionId?: string;
  agentSessionId?: string;
  signal?: AbortSignal;
  taskState?: AgentTaskState;
  emitEvent?: (event: ToolEvent) => void;
  planningRequired?: boolean;
  executingPlanId?: string;
  /** Tools covered by a prior higher-level approval in the same turn. */
  preapprovedTools?: string[];
}

export interface ToolResult {
  ok: boolean;
  summary: string;
  output: string;
  diff?: string;
  metadata?: Record<string, unknown>;
}

export type ToolSource = 'builtin' | 'plugin' | 'mcp';

export interface ToolDefinition<TSchema extends ZodTypeAny = ZodTypeAny> {
  name: string;
  displayName?: string;
  description: string;
  inputSchema: TSchema;
  networkTargets?: (input: unknown, context: ToolExecutionContext) => string[];
  requiresApproval: boolean | ((input: unknown, context: ToolExecutionContext) => boolean);
  riskLevel: RiskLevel;
  run: (input: unknown, context: ToolExecutionContext) => Promise<ToolResult>;
  renderResult?: (result: ToolResult) => string;
  source?: ToolSource;
  enabled?: boolean;
}

export const defineTool = <TSchema extends ZodTypeAny>(
  tool: ToolDefinition<TSchema>,
): ToolDefinition<TSchema> => tool;
