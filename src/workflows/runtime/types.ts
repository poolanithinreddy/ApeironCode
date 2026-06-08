export type WorkflowRiskLevel = 'high' | 'low' | 'medium';

export interface WorkflowStage {
  description: string;
  id: string;
  kind: 'agent' | 'inspect' | 'report' | 'validate';
}

export interface WorkflowRecipe {
  description: string;
  id: string;
  outputArtifacts?: string[];
  requiredSkills?: string[];
  requiredTools?: string[];
  riskLevel: WorkflowRiskLevel;
  stages: WorkflowStage[];
  title: string;
  validationCommands?: string[];
}

export interface WorkflowRunReport {
  createdAt: string;
  dryRun: boolean;
  id: string;
  recipeId: string;
  resultSummary: string;
  stages: Array<{id: string; status: 'completed' | 'planned' | 'skipped'}>;
  task: string;
}
