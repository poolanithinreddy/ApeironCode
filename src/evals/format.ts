import {evalDefinitions} from './registry.js';
import {formatEvalSummary} from './results.js';
import type {EvalReport, EvalRunSummary} from './types.js';

export const formatEvalList = (): string => [
  'Evaluation Suites',
  ...evalDefinitions.map((definition) => `- ${definition.id}: ${definition.title} - ${definition.description}`),
  '',
  'Run: apeironcode eval run smoke',
  'Run all: apeironcode eval run --all',
].join('\n');

export const formatEvalReport = (report: EvalReport | EvalRunSummary | null): string => {
  if (!report) {
    return 'No evaluation report found. Run: apeironcode eval run smoke';
  }
  if ('suiteId' in report) {
    return formatEvalSummary(report);
  }
  return [
    `Evaluation Report: ${report.runId}`,
    `Created: ${report.createdAt}`,
    '',
    ...report.results.flatMap((result) => [
      `- ${result.id}: ${result.status.toUpperCase()}`,
      ...result.details.map((detail) => `  ${detail}`),
    ]),
  ].join('\n');
};
