import type {GitHubClient} from './client.js';

export interface GitHubCheckRun {
  conclusion?: string | null;
  detailsUrl?: string;
  headSha: string;
  htmlUrl?: string;
  id: number;
  name: string;
  output?: {summary?: string | null; text?: string | null; title?: string | null};
  startedAt?: string;
  status: string;
}

export interface GitHubCheckAnnotation {
  annotationLevel?: string;
  blobHref?: string;
  endLine?: number;
  message?: string;
  path?: string;
  rawDetails?: string;
  startLine?: number;
  title?: string;
}

interface RawCheckRun {
  conclusion?: string | null;
  details_url?: string;
  head_sha?: string;
  html_url?: string;
  id?: number;
  name?: string;
  output?: {summary?: string | null; text?: string | null; title?: string | null};
  started_at?: string;
  status?: string;
}

interface RawCheckRunsList {
  check_runs?: RawCheckRun[];
}

interface RawAnnotation {
  annotation_level?: string;
  blob_href?: string;
  end_line?: number;
  message?: string;
  path?: string;
  raw_details?: string;
  start_line?: number;
  title?: string;
}

const mapCheckRun = (run: RawCheckRun): GitHubCheckRun => ({
  conclusion: run.conclusion,
  detailsUrl: run.details_url,
  headSha: run.head_sha ?? '',
  htmlUrl: run.html_url,
  id: run.id ?? 0,
  name: run.name ?? `check-${run.id ?? '?'}`,
  output: run.output ? {
    summary: run.output.summary,
    text: run.output.text,
    title: run.output.title,
  } : undefined,
  startedAt: run.started_at,
  status: run.status ?? 'unknown',
});

export const listCheckRuns = async (client: GitHubClient, ref: string): Promise<GitHubCheckRun[]> => {
  const data = await client.request<RawCheckRunsList>(`/commits/${encodeURIComponent(ref)}/check-runs?per_page=50`);
  return (data.check_runs ?? []).map(mapCheckRun);
};

export const listFailedCheckRuns = async (client: GitHubClient, ref: string): Promise<GitHubCheckRun[]> =>
  (await listCheckRuns(client, ref)).filter((run) => run.conclusion === 'failure' || run.conclusion === 'timed_out');

export const listCheckRunAnnotations = async (
  client: GitHubClient,
  checkRunId: number,
): Promise<GitHubCheckAnnotation[]> => {
  const data = await client.request<RawAnnotation[]>(`/check-runs/${checkRunId}/annotations?per_page=50`);
  return data.map((annotation) => ({
    annotationLevel: annotation.annotation_level,
    blobHref: annotation.blob_href,
    endLine: annotation.end_line,
    message: annotation.message,
    path: annotation.path,
    rawDetails: annotation.raw_details,
    startLine: annotation.start_line,
    title: annotation.title,
  }));
};

export const fetchWorkflowJobLog = async (client: GitHubClient, jobId: number): Promise<string> => {
  return client.requestText(`/actions/jobs/${jobId}/logs`);
};

export const getFailedCheckLogs = async (client: GitHubClient, ref: string): Promise<string> => {
  const failed = await listFailedCheckRuns(client, ref);
  if (failed.length === 0) {
    return 'No failing check logs found.';
  }
  return failed.map((run) => [
    `Check: ${run.name}`,
    `Conclusion: ${run.conclusion ?? 'unknown'}`,
    run.output?.title ? `Title: ${run.output.title}` : null,
    run.output?.summary ? `Summary:\n${run.output.summary}` : null,
    run.output?.text ? `Text:\n${run.output.text}` : null,
    run.htmlUrl ? `URL: ${run.htmlUrl}` : null,
  ].filter(Boolean).join('\n')).join('\n\n').slice(0, 20_000);
};

export const formatFailedCheckSummary = (runs: GitHubCheckRun[]): string => {
  if (runs.length === 0) {
    return 'No failing check runs.';
  }
  return [
    `Failing check runs: ${runs.length}`,
    ...runs.map((run) => [
      `- ${run.name} (${run.conclusion ?? 'unknown'})`,
      run.output?.title ? `    title: ${run.output.title}` : null,
      run.output?.summary ? `    summary: ${run.output.summary.slice(0, 300)}` : null,
    ].filter((line): line is string => line !== null).join('\n')),
  ].join('\n');
};
