import type {AgentMode, ToolCallRecord} from '../agent/types.js';

export interface EvalWorkspace {
  cwd: string;
  cleanup(): Promise<void>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  run(command: string, args?: string[]): Promise<{exitCode: number; stdout: string; stderr: string}>;
}

export interface EvalAssertionContext {
  workspace: EvalWorkspace;
  result: EvalResult;
  initialFiles: Map<string, string>;
}

export interface EvalAssertion {
  name: string;
  run(context: EvalAssertionContext): Promise<string[]>;
}

export interface EvalCase {
  id: string;
  description: string;
  prompt: string;
  mode: AgentMode;
  setup?: () => Promise<EvalWorkspace>;
  assertions: EvalAssertion[];
  timeoutMs?: number;
  tags?: string[];
  expectedTools?: string[];
  maxIterations?: number;
}

export interface EvalSuite {
  id: string;
  description: string;
  cases: EvalCase[];
}

export interface EvalResult {
  id: string;
  passed: boolean;
  durationMs: number;
  failures: string[];
  toolCalls: ToolCallRecord[];
  filesChanged: string[];
  iterations?: number;
  tokenUsage?: unknown;
  tokenEfficiency: TokenEfficiencyMetrics;
  tags?: string[];
}

export interface EvalRunSummary {
  suiteId: string;
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  results: EvalResult[];
  tokenEfficiency: TokenEfficiencyMetrics;
  timestamp?: string;
}

export interface TokenEfficiencyMetrics {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedContextTokens: number;
  estimatedMemoryTokens: number;
  estimatedToolSchemaTokens: number;
  estimatedToolResultTokens: number;
  totalEstimatedTokens: number;
  successPer1kTokens: number;
  toolCallsPer1kTokens: number;
  compressionRatio?: number;
}

export interface EvalAgentRunOptions {
  timeoutMs?: number;
  maxIterations?: number;
}

export interface EvalAgentRunResult {
  toolCalls?: ToolCallRecord[];
  filesChanged?: string[];
  iterations?: number;
  tokenUsage?: unknown;
  finalOutput?: string;
  contextText?: string;
  memoryText?: string;
  toolSchemaText?: string;
  compressionRatio?: number;
}

export interface EvalAgentAdapter {
  runEval(evalCase: EvalCase, workspace: EvalWorkspace, options?: EvalAgentRunOptions): Promise<EvalAgentRunResult>;
}

export interface EvalDefinition {
  id: string;
  title: string;
  description: string;
}

export interface LegacyEvalResult {
  id: string;
  status: 'pass' | 'fail';
  details: string[];
}

export interface EvalReport {
  runId: string;
  createdAt: string;
  results: LegacyEvalResult[];
}
