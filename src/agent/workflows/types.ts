import type {ProjectContextBundle} from '../context.js';
import type {AgentMode} from '../types.js';

export type AgentWorkflowId =
  | 'commit-changes'
  | 'debug-error'
  | 'explain-repo'
  | 'fix-tests'
  | 'implement-feature'
  | 'refactor-code'
  | 'review-diff';

export interface WorkflowBuildInput {
  mode: AgentMode;
  projectContext: ProjectContextBundle;
  prompt: string;
}

export interface AgentWorkflow {
  id: AgentWorkflowId;
  label: string;
  mode: AgentMode;
  plan: string;
  promptAddendum: string;
  summary: string;
}