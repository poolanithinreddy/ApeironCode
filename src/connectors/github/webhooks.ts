export interface GitHubWebhookContext {
  action?: string;
  commentBody?: string;
  commentId?: number;
  eventType: 'issue_comment' | 'pull_request' | 'pull_request_review_comment' | 'check_suite' | 'workflow_run' | 'unknown';
  fork?: boolean;
  issueNumber?: number;
  protectedBranch?: boolean;
  prNumber?: number;
  ref?: string;
  repoFullName?: string;
  senderLogin?: string;
}

interface RawWebhookPayload {
  action?: string;
  check_run?: {head_sha?: string};
  check_suite?: {head_sha?: string};
  comment?: {body?: string; id?: number};
  issue?: {number?: number; pull_request?: unknown};
  pull_request?: {
    base?: {protected?: boolean; ref?: string; repo?: {full_name?: string}};
    head?: {ref?: string; repo?: {fork?: boolean; full_name?: string}; sha?: string};
    number?: number;
  };
  repository?: {full_name?: string};
  sender?: {login?: string};
  workflow_run?: {head_sha?: string};
}

const detectEventType = (payload: RawWebhookPayload, providedEvent?: string): GitHubWebhookContext['eventType'] => {
  if (providedEvent === 'issue_comment') {
    return 'issue_comment';
  }
  if (providedEvent === 'pull_request_review_comment') {
    return 'pull_request_review_comment';
  }
  if (providedEvent === 'pull_request') {
    return 'pull_request';
  }
  if (providedEvent === 'check_suite') {
    return 'check_suite';
  }
  if (providedEvent === 'workflow_run') {
    return 'workflow_run';
  }
  if (payload.comment && payload.issue) {
    return 'issue_comment';
  }
  if (payload.pull_request) {
    return 'pull_request';
  }
  if (payload.check_suite) {
    return 'check_suite';
  }
  if (payload.workflow_run) {
    return 'workflow_run';
  }
  return 'unknown';
};

export const parseGitHubWebhookPayload = (
  payload: unknown,
  providedEvent?: string,
): GitHubWebhookContext => {
  if (!payload || typeof payload !== 'object') {
    return {eventType: 'unknown'};
  }
  const raw = payload as RawWebhookPayload;
  const eventType = detectEventType(raw, providedEvent);
  const issueIsPr = Boolean(raw.issue?.pull_request);

  return {
    action: raw.action,
    commentBody: raw.comment?.body,
    commentId: raw.comment?.id,
    eventType,
    fork: raw.pull_request?.head?.repo?.fork
      ?? (raw.pull_request?.head?.repo?.full_name !== undefined
        && raw.pull_request.base?.repo?.full_name !== undefined
        && raw.pull_request.head.repo.full_name !== raw.pull_request.base.repo.full_name),
    issueNumber: raw.issue?.number,
    protectedBranch: raw.pull_request?.base?.protected,
    prNumber: raw.pull_request?.number ?? (issueIsPr ? raw.issue?.number : undefined),
    ref: raw.pull_request?.head?.sha
      ?? raw.check_suite?.head_sha
      ?? raw.workflow_run?.head_sha
      ?? raw.check_run?.head_sha,
    repoFullName: raw.repository?.full_name,
    senderLogin: raw.sender?.login,
  };
};

export interface MentionCommand {
  args: string[];
  command: string;
  raw: string;
}

const KNOWN_COMMANDS = new Set([
  'implement',
  'review',
  'fix-tests',
  'explain',
  'apply-suggestion',
  'help',
]);

export const parseMentionCommand = (
  commentBody: string | undefined,
  mentionTag: string = '@apeironcode',
): MentionCommand | null => {
  if (!commentBody) {
    return null;
  }
  // Recognise the legacy `@opencode` tag in addition to the canonical
  // `@apeironcode` tag so existing comments and integrations keep working.
  const tags = mentionTag === '@apeironcode' ? ['@apeironcode', '@opencode'] : [mentionTag];
  const lines = commentBody.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const lower = line.toLowerCase();
    let matchedTag: string | null = null;
    let idx = -1;
    for (const tag of tags) {
      const candidate = lower.indexOf(tag.toLowerCase());
      if (candidate !== -1 && (idx === -1 || candidate < idx)) {
        idx = candidate;
        matchedTag = tag;
      }
    }
    if (idx === -1 || matchedTag === null) {
      continue;
    }
    const remainder = line.slice(idx + matchedTag.length).trim();
    if (!remainder) {
      continue;
    }
    const tokens = remainder.split(/\s+/u);
    const command = (tokens[0] ?? '').toLowerCase();
    if (!command) {
      continue;
    }
    return {
      args: tokens.slice(1),
      command,
      raw: remainder,
    };
  }
  return null;
};

export const isKnownMentionCommand = (command: string): boolean =>
  KNOWN_COMMANDS.has(command.toLowerCase());

export const listKnownMentionCommands = (): string[] => Array.from(KNOWN_COMMANDS);
