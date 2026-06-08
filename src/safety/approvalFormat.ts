import {redactSecrets} from '../share/redactor.js';

export interface ApprovalReviewInput {
  action: string;
  filesAffected?: string[];
  matchedRule?: string;
  preview?: string;
  reason: string;
  riskLevel: 'critical' | 'high' | 'low' | 'medium';
  target?: string;
}

export interface ApprovalReviewViewModel {
  actionLine: string;
  fileLines: string[];
  previewLines: string[];
  reasonLine: string;
  riskLine: string;
  ruleLine: string;
  targetLine: string;
}

/**
 * Files affected may be passed explicitly or derived from a comma-joined
 * `target` (the file-plan resource). When neither yields files we render no
 * "Files affected" line at all, so approvals never show a misleading
 * "Files affected: none" while the files are clearly listed in the preview.
 */
const resolveFiles = (input: ApprovalReviewInput): string[] => {
  if (input.filesAffected && input.filesAffected.length > 0) {
    return input.filesAffected;
  }
  const target = input.target ?? '';
  // Treat a comma-joined list of path-like tokens as the affected files.
  if (target.includes(',') && /[/.]/u.test(target)) {
    return target.split(',').map((value) => value.trim()).filter(Boolean);
  }
  return [];
};

export const buildApprovalReviewViewModel = (input: ApprovalReviewInput): ApprovalReviewViewModel => ({
  actionLine: `Action: ${input.action}`,
  fileLines: resolveFiles(input).map((file) => `- ${file}`),
  previewLines: input.preview ? redactSecrets(input.preview).split('\n') : [],
  reasonLine: `Reason: ${input.reason}`,
  riskLine: `Risk: ${input.riskLevel}`,
  ruleLine: `Matched rule: ${input.matchedRule ?? 'none'}`,
  targetLine: `Target: ${input.target ?? 'none'}`,
});

export const formatApprovalReview = (input: ApprovalReviewInput): string => {
  const view = buildApprovalReviewViewModel(input);
  const lines = [view.actionLine, view.riskLine, view.targetLine, view.reasonLine, view.ruleLine];
  if (view.fileLines.length > 0) {
    lines.push('Files affected:', ...view.fileLines);
  }
  if (view.previewLines.length > 0) {
    lines.push('Preview:', ...view.previewLines);
  }
  return lines.join('\n');
};
