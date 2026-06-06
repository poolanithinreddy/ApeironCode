export type AgentKind =
  | 'coder'
  | 'debugger'
  | 'docs-writer'
  | 'git-agent'
  | 'lsp-agent'
  | 'planner'
  | 'release-manager'
  | 'researcher'
  | 'reviewer'
  | 'security-reviewer'
  | 'tester';

export interface AgentDefinition {
  allowedTools: string[];
  description: string;
  kind: AgentKind;
  name: string;
  prompt: string;
}

export interface TeamStep {
  agent: string;
  dependsOn: string[];
  id: string;
  task: string;
}

export interface TeamPlan {
  goal: string;
  mode: 'sequential';
  steps: TeamStep[];
}

export interface SubagentRunResult {
  agent: string;
  summary: string;
  task: string;
}
