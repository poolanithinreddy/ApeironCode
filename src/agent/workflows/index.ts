import type {AgentMode} from '../types.js';
import {buildCommitChangesWorkflow} from './commitChanges.js';
import {buildDebugErrorWorkflow} from './debugError.js';
import {buildExplainRepoWorkflow} from './explainRepo.js';
import {buildFixTestsWorkflow} from './fixTests.js';
import {buildImplementFeatureWorkflow} from './implementFeature.js';
import {buildRefactorCodeWorkflow} from './refactorCode.js';
import {buildReviewDiffWorkflow} from './reviewDiff.js';
import type {AgentWorkflow, WorkflowBuildInput} from './types.js';

const EXPLAIN_PROMPT = /\b(explain|walk me through|overview|architecture|how does this (?:repo|project|codebase)|what does this (?:repo|project|codebase) do)\b/iu;
const REVIEW_PROMPT = /\b(review|audit|code review|inspect (?:the )?diff|review my changes|review changes)\b/iu;
const REFACTOR_PROMPT = /\b(refactor|clean up|cleanup|extract|simplify|restructure)\b/iu;
const COMMIT_PROMPT = /\b(commit|commit message|git commit)\b/iu;
const FEATURE_PROMPT = /\b(add|implement|build|create|introduce|ship)\b/iu;
const DEBUG_PROMPT = /\b(debug|diagnose|investigate|trace|broken|failing|stack trace|exception|error)\b/iu;

export const inferAgentMode = (mode: AgentMode, prompt: string): AgentMode => {
  if (mode !== 'chat') {
    return mode;
  }

  if (EXPLAIN_PROMPT.test(prompt)) {
    return 'explain';
  }
  if (REVIEW_PROMPT.test(prompt)) {
    return 'review';
  }
  if (REFACTOR_PROMPT.test(prompt)) {
    return 'refactor';
  }
  if (COMMIT_PROMPT.test(prompt)) {
    return 'commit';
  }
  if (FEATURE_PROMPT.test(prompt)) {
    return 'feature';
  }
  if (DEBUG_PROMPT.test(prompt)) {
    return 'debug';
  }

  return mode;
};

export const resolveAgentWorkflow = (input: WorkflowBuildInput): AgentWorkflow | null => {
  switch (input.mode) {
    case 'commit':
      return buildCommitChangesWorkflow(input);
    case 'debug':
    case 'fix':
      return buildDebugErrorWorkflow(input);
    case 'explain':
      return buildExplainRepoWorkflow(input);
    case 'feature':
    case 'edit':
      return buildImplementFeatureWorkflow(input);
    case 'refactor':
      return buildRefactorCodeWorkflow(input);
    case 'review':
      return buildReviewDiffWorkflow(input);
    case 'test-fix':
      return buildFixTestsWorkflow(input);
    default:
      return null;
  }
};