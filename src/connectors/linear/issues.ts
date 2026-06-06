import type {LinearClient} from './client.js';
import type {
  LinearComment,
  LinearCreatedRef,
  LinearCreateIssueInput,
  LinearIssue,
  LinearListIssuesOptions,
  LinearUpdateIssueInput,
} from './types.js';

const ISSUE_FIELDS = `
  id
  identifier
  title
  description
  priority
  url
  createdAt
  updatedAt
  state { id name type }
  team { id name key }
  assignee { id name displayName }
`;

interface RawLinearIssue {
  assignee?: {displayName?: string; id: string; name: string} | null;
  createdAt?: string;
  description?: string | null;
  id: string;
  identifier: string;
  priority?: number;
  state?: {id: string; name: string; type?: string} | null;
  team?: {id: string; key?: string; name: string} | null;
  title: string;
  updatedAt?: string;
  url?: string;
}

const mapIssue = (issue: RawLinearIssue): LinearIssue => ({
  assignee: issue.assignee ?? null,
  createdAt: issue.createdAt,
  description: issue.description ?? null,
  id: issue.id,
  identifier: issue.identifier,
  priority: issue.priority,
  state: issue.state ?? null,
  team: issue.team ?? null,
  title: issue.title,
  updatedAt: issue.updatedAt,
  url: issue.url,
});

export const listLinearIssues = async (
  client: LinearClient,
  options: LinearListIssuesOptions = {},
): Promise<LinearIssue[]> => {
  const filter: Record<string, unknown> = {};
  if (options.teamId) {
    filter.team = {id: {eq: options.teamId}};
  }
  if (options.assigneeId) {
    filter.assignee = {id: {eq: options.assigneeId}};
  }
  if (options.stateType) {
    filter.state = {type: {eq: options.stateType}};
  }

  const query = `
    query Issues($first: Int, $filter: IssueFilter) {
      issues(first: $first, filter: $filter) {
        nodes { ${ISSUE_FIELDS} }
      }
    }
  `;
  const data = await client.request<{issues: {nodes: RawLinearIssue[]}}>(query, {
    filter: Object.keys(filter).length > 0 ? filter : undefined,
    first: options.first ?? 25,
  });
  return data.issues.nodes.map(mapIssue);
};

export const getLinearIssue = async (client: LinearClient, id: string): Promise<LinearIssue> => {
  const query = `
    query Issue($id: String!) {
      issue(id: $id) { ${ISSUE_FIELDS} }
    }
  `;
  const data = await client.request<{issue: RawLinearIssue}>(query, {id});
  return mapIssue(data.issue);
};

export const createLinearIssue = async (
  client: LinearClient,
  input: LinearCreateIssueInput,
): Promise<LinearCreatedRef> => {
  const mutation = `
    mutation IssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier url }
      }
    }
  `;
  const data = await client.request<{issueCreate: {issue: {id: string; identifier?: string; url?: string}; success: boolean}}>(
    mutation,
    {input},
  );
  if (!data.issueCreate.success || !data.issueCreate.issue) {
    throw new Error('Linear issue creation failed.');
  }
  return data.issueCreate.issue;
};

export const updateLinearIssue = async (
  client: LinearClient,
  id: string,
  input: LinearUpdateIssueInput,
): Promise<LinearCreatedRef> => {
  const mutation = `
    mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue { id identifier url }
      }
    }
  `;
  const data = await client.request<{issueUpdate: {issue: {id: string; identifier?: string; url?: string}; success: boolean}}>(
    mutation,
    {id, input},
  );
  if (!data.issueUpdate.success || !data.issueUpdate.issue) {
    throw new Error('Linear issue update failed.');
  }
  return data.issueUpdate.issue;
};

export const addLinearIssueComment = async (
  client: LinearClient,
  issueId: string,
  body: string,
): Promise<LinearComment> => {
  const mutation = `
    mutation CommentCreate($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        success
        comment { id body createdAt user { id name displayName } }
      }
    }
  `;
  const data = await client.request<{commentCreate: {comment: {body: string; createdAt?: string; id: string; user?: {displayName?: string; id: string; name: string} | null}; success: boolean}}>(
    mutation,
    {input: {body, issueId}},
  );
  if (!data.commentCreate.success || !data.commentCreate.comment) {
    throw new Error('Linear comment creation failed.');
  }
  return {
    body: data.commentCreate.comment.body,
    createdAt: data.commentCreate.comment.createdAt,
    id: data.commentCreate.comment.id,
    user: data.commentCreate.comment.user ?? null,
  };
};
