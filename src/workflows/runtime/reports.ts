import path from 'node:path';

import {readJsonFile, writeJsonFile} from '../../utils/fs.js';
import {getProjectConfigDir} from '../../utils/paths.js';
import type {WorkflowRunReport} from './types.js';

interface WorkflowReportStoreData {
  reports: WorkflowRunReport[];
}

export const getWorkflowReportsPath = (cwd: string): string =>
  path.join(getProjectConfigDir(cwd), 'workflows', 'reports.json');

export class WorkflowReportStore {
  constructor(private readonly cwd: string) {}

  async list(): Promise<WorkflowRunReport[]> {
    const data = await readJsonFile<WorkflowReportStoreData>(getWorkflowReportsPath(this.cwd), {reports: []});
    return Array.isArray(data.reports) ? data.reports : [];
  }

  async save(report: WorkflowRunReport): Promise<WorkflowRunReport> {
    const reports = await this.list();
    await writeJsonFile(getWorkflowReportsPath(this.cwd), {
      reports: [...reports.filter((entry) => entry.id !== report.id), report],
    });
    return report;
  }

  async get(id: string): Promise<WorkflowRunReport | null> {
    return (await this.list()).find((report) => report.id === id) ?? null;
  }
}

export const formatWorkflowReport = (report: WorkflowRunReport | null): string => {
  if (!report) {
    return 'Workflow report not found.';
  }
  return [
    `Workflow report: ${report.id}`,
    `Recipe: ${report.recipeId}`,
    `Task: ${report.task}`,
    `Dry run: ${report.dryRun ? 'yes' : 'no'}`,
    `Created: ${report.createdAt}`,
    '',
    'Stages:',
    ...report.stages.map((stage) => `- ${stage.status}: ${stage.id}`),
    '',
    report.resultSummary,
  ].join('\n');
};
