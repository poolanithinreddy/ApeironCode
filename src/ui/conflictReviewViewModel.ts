import type {MergePlan} from '../agents/workspace/types.js';

export interface ConflictReviewItem {
  baseLine: string;
  fileLine: string;
  mainLine: string;
  reasonLine: string;
  recommendationLine: string;
  riskLine: string;
  typeLine: string;
  workspaceLine: string;
}

export interface ConflictReviewViewModel {
  empty: boolean;
  items: ConflictReviewItem[];
  title: string;
}

export const buildConflictReviewViewModel = (plans: MergePlan[]): ConflictReviewViewModel => {
  const conflicts = plans.flatMap((plan) => plan.conflictDetails ?? []);
  return {
    empty: conflicts.length === 0,
    items: conflicts.map((conflict) => ({
      baseLine: 'Base: snapshot stored at workspace creation',
      fileLine: conflict.path,
      mainLine: 'Main: current workspace requires review',
      reasonLine: `Reason: ${conflict.reason}`,
      recommendationLine: 'Next: inspect manually, apply a clean file, or discard the workspace.',
      riskLine: `Risk: ${conflict.type === 'binary' || conflict.type.startsWith('rename') ? 'high' : 'medium'}`,
      typeLine: `Type: ${conflict.type}`,
      workspaceLine: 'Isolated: subagent workspace has competing changes',
    })),
    title: conflicts.length === 0 ? 'Conflict Review' : `Conflict Review (${conflicts.length})`,
  };
};
