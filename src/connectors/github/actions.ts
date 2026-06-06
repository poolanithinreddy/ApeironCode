import type {GitHubActionsJob, GitHubActionsRun} from '../types.js';
import type {GitHubClient} from './client.js';

interface GitHubRunsResponse {
  workflow_runs?: Array<{
    conclusion?: string | null;
    html_url?: string;
    id: number;
    name?: string;
    status?: string;
    updated_at?: string;
  }>;
}

interface GitHubJobsResponse {
  jobs?: Array<{
    conclusion?: string | null;
    html_url?: string;
    id: number;
    name?: string;
    status?: string;
    steps?: Array<{
      conclusion?: string | null;
      name?: string;
      status?: string;
    }>;
  }>;
}

export const listGitHubActionsRuns = async (client: GitHubClient): Promise<GitHubActionsRun[]> => {
  const response = await client.request<GitHubRunsResponse>('/actions/runs?per_page=10');
  return (response.workflow_runs ?? []).map((run) => ({
    conclusion: run.conclusion,
    htmlUrl: run.html_url,
    id: run.id,
    name: run.name ?? `run-${run.id}`,
    status: run.status ?? 'unknown',
    updatedAt: run.updated_at,
  }));
};

export const listGitHubActionsJobs = async (client: GitHubClient, runId: number): Promise<GitHubActionsJob[]> => {
  const response = await client.request<GitHubJobsResponse>(`/actions/runs/${runId}/jobs?per_page=50`);
  return (response.jobs ?? []).map((job) => ({
    conclusion: job.conclusion,
    htmlUrl: job.html_url,
    id: job.id,
    name: job.name ?? `job-${job.id}`,
    status: job.status ?? 'unknown',
    steps: (job.steps ?? []).map((step) => ({
      conclusion: step.conclusion,
      name: step.name ?? 'unnamed step',
      status: step.status,
    })),
  }));
};

export const formatGitHubActionsRuns = (runs: GitHubActionsRun[]): string => {
  if (runs.length === 0) {
    return 'No GitHub Actions runs found.';
  }
  return [
    'GitHub Actions',
    ...runs.map((run) => `- ${run.id} | ${run.name} | ${run.status}${run.conclusion ? `/${run.conclusion}` : ''}${run.updatedAt ? ` | ${run.updatedAt}` : ''}`),
  ].join('\n');
};

export const fetchWorkflowJobLogText = async (
  client: GitHubClient,
  jobId: number,
): Promise<string> => {
  try {
    return await client.requestText(`/actions/jobs/${jobId}/logs`);
  } catch {
    return '';
  }
};

interface RawArtifactsResponse {
  artifacts?: Array<{
    archive_download_url?: string;
    expired?: boolean;
    expires_at?: string;
    id: number;
    name?: string;
    size_in_bytes?: number;
  }>;
}

export const listWorkflowRunArtifacts = async (
  client: GitHubClient,
  runId: number,
): Promise<Array<{archiveSizeBytes?: number; expired?: boolean; expiresAt?: string; id: number; name: string; url?: string}>> => {
  const response: RawArtifactsResponse = await client.request<RawArtifactsResponse>(`/actions/runs/${runId}/artifacts?per_page=50`).catch(() => ({artifacts: []}));
  return (response.artifacts ?? []).map((a) => ({
    archiveSizeBytes: a.size_in_bytes,
    expired: a.expired,
    expiresAt: a.expires_at,
    id: a.id,
    name: a.name ?? `artifact-${a.id}`,
    url: a.archive_download_url,
  }));
};

export const formatGitHubCiExplanation = (jobs: GitHubActionsJob[], runId?: number | string): string => {
  const failedJobs = jobs.filter((job) => job.conclusion === 'failure' || job.steps.some((step) => step.conclusion === 'failure'));
  return [
    `GitHub CI explanation${runId ? ` for run ${runId}` : ''}`,
    failedJobs.length === 0 ? 'No failed jobs found in the fetched run data.' : `Failed jobs: ${failedJobs.length}`,
    ...failedJobs.flatMap((job) => [
      `- ${job.name} | ${job.status}/${job.conclusion ?? 'unknown'}`,
      ...job.steps
        .filter((step) => step.conclusion === 'failure')
        .map((step) => `  failing step: ${step.name}`),
    ]),
    '',
    'Likely next steps: inspect failing steps, reproduce locally with the matching workflow command, then use `apeironcode workflow run fix-tests` or `apeironcode workflow run debug-error` with the failure text.',
  ].join('\n');
};
