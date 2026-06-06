/**
 * Shared types for ApeironCode Markdown-defined workflow extensibility.
 * Agents, Skills, and Commands loaded from .apeironcode/ subdirectories.
 */

import type {PermissionMode} from '../safety/permissionModes.js';

export type WorkflowDefinitionKind = 'agent' | 'skill' | 'command';

export type WorkflowSource = 'project' | 'global' | 'builtin';

export type WorkflowTrustStatus = 'allowed' | 'blocked' | 'pending';

export type WorkflowPermissionMode = PermissionMode | 'inherit';

export interface WorkflowToolPolicy {
  allowedTools: string[];
  disallowedTools: string[];
}

export interface WorkflowValidationIssue {
  severity: 'error' | 'warn';
  field?: string;
  message: string;
}

export interface WorkflowLoadResult<T> {
  definition: T | null;
  issues: WorkflowValidationIssue[];
  trustStatus: WorkflowTrustStatus;
  source: WorkflowSource;
  filePath: string;
}

// ─────────────────────────────────────────────
// Agent definition
// ─────────────────────────────────────────────

export interface AgentDefinition {
  kind: 'agent';
  source: WorkflowSource;
  filePath: string;
  name: string;
  description: string;
  model?: string;
  effort?: 'low' | 'medium' | 'high';
  tools: string[];
  disallowedTools: string[];
  permissionMode: WorkflowPermissionMode;
  maxTurns?: number;
  skills: string[];
  memory?: 'project' | 'global' | 'none' | 'inherit';
  isolation?: 'none' | 'sandbox';
  background?: boolean;
  hooks?: string[];
  body: string;
}

// ─────────────────────────────────────────────
// Skill definition
// ─────────────────────────────────────────────

export interface SkillDefinition {
  kind: 'skill';
  source: WorkflowSource;
  filePath: string;
  name: string;
  description: string;
  whenToUse: string;
  allowedTools: string[];
  disallowedTools: string[];
  references: string[];
  scripts: string[];
  tokenBudget?: number;
  progressiveDisclosure: boolean;
  body: string;
}

// ─────────────────────────────────────────────
// Command definition
// ─────────────────────────────────────────────

export interface CommandDefinition {
  kind: 'command';
  source: WorkflowSource;
  filePath: string;
  name: string;
  description: string;
  aliases: string[];
  argumentHint?: string;
  body: string;
  allowedTools: string[];
  permissionMode: WorkflowPermissionMode;
  requiresTrust: boolean;
}

// ─────────────────────────────────────────────
// Registry summary
// ─────────────────────────────────────────────

export interface WorkflowRegistrySummary {
  agents: AgentDefinition[];
  skills: SkillDefinition[];
  commands: CommandDefinition[];
  blocked: Array<{kind: WorkflowDefinitionKind; name: string; reason: string}>;
  warnings: WorkflowValidationIssue[];
}
