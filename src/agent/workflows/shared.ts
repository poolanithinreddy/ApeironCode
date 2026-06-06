import type {ProjectContextBundle} from '../context.js';
import type {AgentMode} from '../types.js';
import type {AgentWorkflow, AgentWorkflowId, WorkflowBuildInput} from './types.js';

const getLikelyFiles = (projectContext: ProjectContextBundle, limit = 4): string[] => {
  return projectContext.relevantFiles.slice(0, limit).map((file) => file.path);
};

const getValidationCommand = (projectContext: ProjectContextBundle): string | null => {
  return projectContext.projectScan.testCommand
    ?? projectContext.projectScan.lintCommand
    ?? projectContext.projectScan.buildCommand
    ?? null;
};

const formatNumberedSteps = (steps: string[]): string[] => {
  return steps.map((step, index) => `${index + 1}. ${step}`);
};

export const createWorkflow = ({
  approach,
  id,
  input,
  label,
  mode,
  steps,
  summary,
}: {
  approach: string[];
  id: AgentWorkflowId;
  input: WorkflowBuildInput;
  label: string;
  mode: AgentMode;
  steps: string[];
  summary: string;
}): AgentWorkflow => {
  const likelyFiles = getLikelyFiles(input.projectContext);
  const validationCommand = getValidationCommand(input.projectContext);
  const likelyFileText = likelyFiles.length > 0
    ? likelyFiles.join(', ')
    : 'Use repo relevance and the project tree to pick the first files.';

  return {
    id,
    label,
    mode,
    plan: [
      `${label}`,
      `Goal: ${input.prompt}`,
      `Project: ${input.projectContext.projectScan.projectName}`,
      input.projectContext.codeIntelligenceSummary,
      `Likely files: ${likelyFileText}`,
      `Validation: ${validationCommand ?? 'Choose the narrowest relevant check after changes.'}`,
      'Execution:',
      ...formatNumberedSteps(steps),
    ].join('\n'),
    promptAddendum: [
      `Active workflow: ${label}. ${summary}`,
      input.projectContext.codeIntelligenceSummary,
      `Open with these files when possible: ${likelyFileText}`,
      'Preferred approach:',
      ...formatNumberedSteps(approach),
      validationCommand
        ? `Validation target: ${validationCommand}`
        : 'Validation target: choose the narrowest relevant command after edits.',
    ].join('\n'),
    summary,
  };
};

export const getWorkflowValidationCommand = (projectContext: ProjectContextBundle): string | null => {
  return getValidationCommand(projectContext);
};