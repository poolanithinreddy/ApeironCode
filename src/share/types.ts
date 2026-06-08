export interface SessionExportEvent {
  id: string;
  type: string;
  timestamp: string;
  message?: string;
  data?: Record<string, unknown>;
}

export interface SessionExport {
  sessionId: string;
  projectPath: string;
  goal: string;
  status: string;
  mode?: string;
  provider?: string;
  model?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  summary?: string;
  filesLocked: string[];
  filesChanged: string[];
  commandsRun: string[];
  testsRun: string[];
  events?: SessionExportEvent[];
  permissionDecisions?: Array<{decision: string; resource: string}>;
  estimatedCost?: {inputTokens: number; outputTokens: number; estimatedCostUsd: number};
  linkedTaskId?: string;
  exportedAt: string;
}

export interface ExportOptions {
  format?: 'json' | 'markdown' | 'html';
  includeDetails?: boolean;
  redactSecrets?: boolean;
}
