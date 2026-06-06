import type {AgentTaskState, AgentMode, ToolCallRecord} from '../types.js';
import type {ProjectScan} from '../../context/scanner.js';

export interface ProjectMemory {
  purpose?: string;
  architecture?: string;
  importantFiles?: string[];
  importantCommands?: string[];
  testCommand?: string;
  buildCommand?: string;
  lintCommand?: string;
  conventions?: string[];
  pitfalls?: string[];
  recentErrors?: {message: string; fix?: string}[];
  userPreferences?: string[];
}

export interface GlobalMemory {
  codingStyle?: string;
  preferredProviders?: string[];
  preferredModels?: {[key: string]: string};
  testStrategy?: string;
  commitStyle?: 'conventional' | 'plain';
  explanationStyle?: string;
  customRules?: string[];
}

export type MemorySuggestionCategory = 'architecture' | 'command' | 'file' | 'pitfall' | 'preference';

export interface MemorySuggestion {
  category: MemorySuggestionCategory;
  decision: 'saved' | 'skipped';
  summary: string;
}

export interface LoadedMemoryReason {
  source: 'global' | 'project';
  reason: string;
  summary: string;
}

export interface SessionMemory {
  createdAt: string;
  completedAt?: string;
  mode?: AgentMode;
  goal: string;
  filesInspected: string[];
  filesModified: string[];
  commandsRun: string[];
  testsRun: string[];
  decisionsMade: string[];
  failedAttempts: string[];
  finalResult?: string;
  followUpTasks?: string[];
  memorySuggestions?: MemorySuggestion[];
  memoryWhy?: LoadedMemoryReason[];
  summary?: string;
  tags?: string[];
}

export interface ProjectMemoryExtractionInput {
  goal: string;
  mode: AgentMode;
  projectScan?: ProjectScan;
  relevantFiles?: string[];
  summary?: string;
  taskState?: AgentTaskState;
}

export interface SessionMemoryExtractionInput {
  goal: string;
  mode: AgentMode;
  finalResult?: string;
  memorySuggestions?: MemorySuggestion[];
  memoryWhy?: LoadedMemoryReason[];
  taskState?: AgentTaskState;
  toolCalls?: ToolCallRecord[];
}
