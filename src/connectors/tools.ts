import {z} from 'zod';

import {defineTool, type ToolDefinition, type ToolExecutionContext, type ToolResult} from '../tools/types.js';
import type {ToolSchema} from '../tools/schema.js';
import {detectGitHubRepo} from './github/repos.js';
import {GitHubClient} from './github/client.js';
import {createGitHubIssue, createGitHubIssueComment, getGitHubIssue, listGitHubIssues} from './github/issues.js';
import {listGitHubPulls} from './github/pulls.js';
import {
  addLinearIssueComment,
  createLinearIssue,
  formatLinearIssue,
  formatLinearIssueList,
  formatLinearProject,
  formatLinearProjectList,
  getLinearIssue,
  getLinearProject,
  LinearClient,
  listLinearIssues,
  listLinearProjects,
  updateLinearIssue,
} from './linear/index.js';
import {
  addJiraComment,
  createJiraIssue,
  formatJiraIssue,
  formatJiraIssueList,
  formatJiraProjectList,
  getJiraIssue,
  JiraClient,
  listJiraProjects,
  searchJiraIssues,
  transitionJiraIssue,
} from './jira/index.js';
import {
  addSlackReaction,
  formatSlackChannelList,
  formatSlackMessageList,
  getSlackChannelHistory,
  listSlackChannels,
  sendSlackMessage,
  SlackClient,
  updateSlackMessage,
} from './slack/index.js';

const ok = (summary: string, output: string, metadata?: Record<string, unknown>): ToolResult => ({
  metadata,
  ok: true,
  output,
  summary,
});

const fail = (summary: string, error: unknown): ToolResult => ({
  ok: false,
  output: error instanceof Error ? error.message : String(error),
  summary,
});

const toDefinition = (schema: ToolSchema, sideEffecting: boolean): ToolDefinition =>
  defineTool({
    description: schema.description,
    inputSchema: schema.inputSchema,
    name: schema.name,
    requiresApproval: sideEffecting,
    riskLevel: sideEffecting ? 'medium' : 'low',
    run: schema.execute,
  });

const withGitHubClient = async <T>(
  context: ToolExecutionContext,
  work: (client: GitHubClient) => Promise<T>,
): Promise<T> => {
  const repo = await detectGitHubRepo(context.cwd);
  if (!repo) {
    throw new Error('GitHub repository remote was not detected for this workspace.');
  }
  return work(new GitHubClient({repo}));
};

const schemas: Array<{schema: ToolSchema; sideEffecting: boolean}> = [{
  sideEffecting: false,
  schema: {
    category: 'other',
    description: 'List open GitHub issues for the current repository when the task needs GitHub issue context.',
    inputSchema: z.object({}),
    name: 'github_list_issues',
    execute: async (_input, context) => {
      try {
        const issues = await withGitHubClient(context, listGitHubIssues);
        return ok(`Listed ${issues.length} GitHub issue(s)`, issues.map((issue) => `#${issue.number} ${issue.title} | ${issue.state}`).join('\n') || 'No GitHub issues found.');
      } catch (error) {
        return fail('GitHub issues unavailable', error);
      }
    },
  },
}, {
  sideEffecting: false,
  schema: {
    category: 'other',
    description: 'Get a GitHub issue by number when exact issue details are needed.',
    inputSchema: z.object({number: z.number().int().positive()}),
    name: 'github_get_issue',
    execute: async (input, context) => {
      const parsed = z.object({number: z.number().int().positive()}).parse(input);
      try {
        const issue = await withGitHubClient(context, (client) => getGitHubIssue(client, parsed.number));
        return ok(`GitHub issue #${issue.number}`, `${issue.title}\nState: ${issue.state}\n${issue.htmlUrl ?? ''}\n\n${issue.body ?? ''}`);
      } catch (error) {
        return fail('GitHub issue unavailable', error);
      }
    },
  },
}, {
  sideEffecting: true,
  schema: {
    category: 'other',
    description: 'Create a GitHub issue. This writes to GitHub and should only be used when the user asks to create an issue.',
    inputSchema: z.object({body: z.string().optional(), title: z.string().min(1)}),
    name: 'github_create_issue',
    execute: async (input, context) => {
      const parsed = z.object({body: z.string().optional(), title: z.string().min(1)}).parse(input);
      try {
        const issue = await withGitHubClient(context, (client) => createGitHubIssue(client, parsed));
        return ok(`Created GitHub issue #${issue.number}`, issue.htmlUrl ?? `#${issue.number}`);
      } catch (error) {
        return fail('GitHub issue creation failed', error);
      }
    },
  },
}, {
  sideEffecting: true,
  schema: {
    category: 'other',
    description: 'Add a comment to a GitHub issue. This writes to GitHub and should only be used when the user asks to comment.',
    inputSchema: z.object({body: z.string().min(1), number: z.number().int().positive()}),
    name: 'github_add_comment',
    execute: async (input, context) => {
      const parsed = z.object({body: z.string().min(1), number: z.number().int().positive()}).parse(input);
      try {
        const comment = await withGitHubClient(context, (client) => createGitHubIssueComment(client, parsed.number, parsed.body));
        return ok(`Commented on GitHub issue #${parsed.number}`, comment.htmlUrl ?? String(comment.id));
      } catch (error) {
        return fail('GitHub comment failed', error);
      }
    },
  },
}, {
  sideEffecting: false,
  schema: {
    category: 'other',
    description: 'List open GitHub pull requests for the current repository when PR context is needed.',
    inputSchema: z.object({}),
    name: 'github_list_prs',
    execute: async (_input, context) => {
      try {
        const prs = await withGitHubClient(context, listGitHubPulls);
        return ok(`Listed ${prs.length} GitHub pull request(s)`, prs.map((pr) => `#${pr.number} ${pr.title} | ${pr.head ?? '?'} -> ${pr.base ?? '?'}`).join('\n') || 'No GitHub pull requests found.');
      } catch (error) {
        return fail('GitHub pull requests unavailable', error);
      }
    },
  },
}];

const add = (schema: ToolSchema, sideEffecting: boolean): void => {
  schemas.push({schema, sideEffecting});
};

add({
  category: 'other',
  description: 'List Linear issues when the task needs current Linear work items.',
  inputSchema: z.object({assigneeId: z.string().optional(), first: z.number().int().positive().max(100).optional(), stateType: z.enum(['backlog', 'unstarted', 'started', 'completed', 'canceled', 'triage']).optional(), teamId: z.string().optional()}),
  name: 'linear_list_issues',
  execute: async (input) => {
    try {
      const issues = await listLinearIssues(new LinearClient(), input as Record<string, never>);
      return ok(`Listed ${issues.length} Linear issue(s)`, formatLinearIssueList(issues));
    } catch (error) {
      return fail('Linear issues unavailable', error);
    }
  },
}, false);
add({category: 'other', description: 'Get a Linear issue by id or identifier.', inputSchema: z.object({id: z.string().min(1)}), name: 'linear_get_issue', execute: async (input) => { try { const parsed = z.object({id: z.string().min(1)}).parse(input); const issue = await getLinearIssue(new LinearClient(), parsed.id); return ok(`Linear issue ${issue.identifier}`, formatLinearIssue(issue)); } catch (error) { return fail('Linear issue unavailable', error); } }}, false);
add({category: 'other', description: 'Create a Linear issue. This writes to Linear and should only be used when the user asks to create an issue.', inputSchema: z.object({assigneeId: z.string().optional(), description: z.string().optional(), priority: z.number().int().optional(), stateId: z.string().optional(), teamId: z.string().min(1), title: z.string().min(1)}), name: 'linear_create_issue', execute: async (input) => { try { const issue = await createLinearIssue(new LinearClient(), input as never); return ok(`Created Linear issue ${issue.identifier ?? issue.id}`, issue.url ?? issue.id); } catch (error) { return fail('Linear issue creation failed', error); } }}, true);
add({category: 'other', description: 'Update a Linear issue. This writes to Linear and should only be used when the user asks to update an issue.', inputSchema: z.object({assigneeId: z.string().optional(), description: z.string().optional(), id: z.string().min(1), priority: z.number().int().optional(), stateId: z.string().optional(), title: z.string().optional()}), name: 'linear_update_issue', execute: async (input) => { try { const parsed = z.object({assigneeId: z.string().optional(), description: z.string().optional(), id: z.string().min(1), priority: z.number().int().optional(), stateId: z.string().optional(), title: z.string().optional()}).parse(input); const {id, ...update} = parsed; const issue = await updateLinearIssue(new LinearClient(), id, update); return ok(`Updated Linear issue ${issue.identifier ?? issue.id}`, issue.url ?? issue.id); } catch (error) { return fail('Linear issue update failed', error); } }}, true);
add({category: 'other', description: 'Add a comment to a Linear issue. This writes to Linear and should only be used when the user asks to comment.', inputSchema: z.object({body: z.string().min(1), issueId: z.string().min(1)}), name: 'linear_add_comment', execute: async (input) => { try { const parsed = z.object({body: z.string().min(1), issueId: z.string().min(1)}).parse(input); const comment = await addLinearIssueComment(new LinearClient(), parsed.issueId, parsed.body); return ok(`Commented on Linear issue ${parsed.issueId}`, comment.id); } catch (error) { return fail('Linear comment failed', error); } }}, true);
add({category: 'other', description: 'List Linear projects when project context is needed.', inputSchema: z.object({}), name: 'linear_list_projects', execute: async () => { try { const projects = await listLinearProjects(new LinearClient()); return ok(`Listed ${projects.length} Linear project(s)`, formatLinearProjectList(projects)); } catch (error) { return fail('Linear projects unavailable', error); } }}, false);
add({category: 'other', description: 'Get a Linear project by id.', inputSchema: z.object({id: z.string().min(1)}), name: 'linear_get_project', execute: async (input) => { try { const parsed = z.object({id: z.string().min(1)}).parse(input); const project = await getLinearProject(new LinearClient(), parsed.id); return ok(`Linear project ${project.name}`, formatLinearProject(project)); } catch (error) { return fail('Linear project unavailable', error); } }}, false);

add({category: 'other', description: 'Search Jira issues with JQL when Jira work item context is needed.', inputSchema: z.object({jql: z.string().min(1), maxResults: z.number().int().positive().max(100).optional(), startAt: z.number().int().nonnegative().optional()}), name: 'jira_search_issues', execute: async (input) => { try { const parsed = z.object({jql: z.string().min(1), maxResults: z.number().int().positive().max(100).optional(), startAt: z.number().int().nonnegative().optional()}).parse(input); const issues = await searchJiraIssues(new JiraClient(), parsed.jql, parsed); return ok(`Found ${issues.length} Jira issue(s)`, formatJiraIssueList(issues)); } catch (error) { return fail('Jira search failed', error); } }}, false);
add({category: 'other', description: 'Get a Jira issue by key.', inputSchema: z.object({key: z.string().min(1)}), name: 'jira_get_issue', execute: async (input) => { try { const parsed = z.object({key: z.string().min(1)}).parse(input); const issue = await getJiraIssue(new JiraClient(), parsed.key); return ok(`Jira issue ${issue.key}`, formatJiraIssue(issue)); } catch (error) { return fail('Jira issue unavailable', error); } }}, false);
add({category: 'other', description: 'Create a Jira issue. This writes to Jira and should only be used when the user asks to create an issue.', inputSchema: z.object({assigneeAccountId: z.string().optional(), description: z.string().optional(), issueTypeName: z.string().optional(), priorityName: z.string().optional(), projectKey: z.string().min(1), summary: z.string().min(1)}), name: 'jira_create_issue', execute: async (input) => { try { const issue = await createJiraIssue(new JiraClient(), input as never); return ok(`Created Jira issue ${issue.key}`, issue.url ?? issue.key); } catch (error) { return fail('Jira issue creation failed', error); } }}, true);
add({category: 'other', description: 'Add a comment to a Jira issue. This writes to Jira and should only be used when the user asks to comment.', inputSchema: z.object({body: z.string().min(1), issueKey: z.string().min(1)}), name: 'jira_add_comment', execute: async (input) => { try { const parsed = z.object({body: z.string().min(1), issueKey: z.string().min(1)}).parse(input); const comment = await addJiraComment(new JiraClient(), parsed.issueKey, parsed.body); return ok(`Commented on Jira issue ${parsed.issueKey}`, comment.id); } catch (error) { return fail('Jira comment failed', error); } }}, true);
add({category: 'other', description: 'Transition a Jira issue. This writes to Jira workflow state and should only be used when the user asks to transition an issue.', inputSchema: z.object({issueKey: z.string().min(1), transitionId: z.string().min(1)}), name: 'jira_transition_issue', execute: async (input) => { try { const parsed = z.object({issueKey: z.string().min(1), transitionId: z.string().min(1)}).parse(input); await transitionJiraIssue(new JiraClient(), parsed.issueKey, parsed.transitionId); return ok(`Transitioned Jira issue ${parsed.issueKey}`, `Applied transition ${parsed.transitionId}`); } catch (error) { return fail('Jira transition failed', error); } }}, true);
add({category: 'other', description: 'List Jira projects when project keys or Jira project context are needed.', inputSchema: z.object({}), name: 'jira_list_projects', execute: async () => { try { const projects = await listJiraProjects(new JiraClient()); return ok(`Listed ${projects.length} Jira project(s)`, formatJiraProjectList(projects)); } catch (error) { return fail('Jira projects unavailable', error); } }}, false);

add({category: 'other', description: 'List Slack channels when the task needs to find a Slack channel id.', inputSchema: z.object({excludeArchived: z.boolean().optional(), limit: z.number().int().positive().max(1000).optional(), types: z.array(z.enum(['public_channel', 'private_channel', 'mpim', 'im'])).optional()}), name: 'slack_list_channels', execute: async (input) => { try { const channels = await listSlackChannels(new SlackClient(), input as Record<string, never>); return ok(`Listed ${channels.length} Slack channel(s)`, formatSlackChannelList(channels)); } catch (error) { return fail('Slack channels unavailable', error); } }}, false);
add({category: 'other', description: 'Get Slack channel history when conversation context is needed.', inputSchema: z.object({channelId: z.string().min(1), inclusive: z.boolean().optional(), latest: z.string().optional(), limit: z.number().int().positive().max(1000).optional(), oldest: z.string().optional()}), name: 'slack_get_channel_history', execute: async (input) => { try { const parsed = z.object({channelId: z.string().min(1), inclusive: z.boolean().optional(), latest: z.string().optional(), limit: z.number().int().positive().max(1000).optional(), oldest: z.string().optional()}).parse(input); const {channelId, ...options} = parsed; const messages = await getSlackChannelHistory(new SlackClient(), channelId, options); return ok(`Read ${messages.length} Slack message(s)`, formatSlackMessageList(messages)); } catch (error) { return fail('Slack history unavailable', error); } }}, false);
add({category: 'other', description: 'Send a Slack message. This writes to Slack and should only be used when the user asks to send a message.', inputSchema: z.object({channelId: z.string().min(1), text: z.string().min(1), threadTs: z.string().optional(), unfurlLinks: z.boolean().optional()}), name: 'slack_send_message', execute: async (input) => { try { const parsed = z.object({channelId: z.string().min(1), text: z.string().min(1), threadTs: z.string().optional(), unfurlLinks: z.boolean().optional()}).parse(input); const {channelId, text, ...options} = parsed; const message = await sendSlackMessage(new SlackClient(), channelId, text, options); return ok(`Sent Slack message to ${message.channel}`, message.ts); } catch (error) { return fail('Slack send failed', error); } }}, true);
add({category: 'other', description: 'Update a Slack message. This writes to Slack and should only be used when the user asks to edit a sent message.', inputSchema: z.object({channelId: z.string().min(1), text: z.string().min(1), ts: z.string().min(1)}), name: 'slack_update_message', execute: async (input) => { try { const parsed = z.object({channelId: z.string().min(1), text: z.string().min(1), ts: z.string().min(1)}).parse(input); const message = await updateSlackMessage(new SlackClient(), parsed.channelId, parsed.ts, parsed.text); return ok(`Updated Slack message in ${message.channel}`, message.ts); } catch (error) { return fail('Slack update failed', error); } }}, true);
add({category: 'other', description: 'Add a reaction to a Slack message. This writes to Slack and should only be used when the user asks to react.', inputSchema: z.object({channelId: z.string().min(1), reaction: z.string().min(1), ts: z.string().min(1)}), name: 'slack_add_reaction', execute: async (input) => { try { const parsed = z.object({channelId: z.string().min(1), reaction: z.string().min(1), ts: z.string().min(1)}).parse(input); const result = await addSlackReaction(new SlackClient(), parsed.channelId, parsed.ts, parsed.reaction); return ok(`Added Slack reaction ${result.reaction}`, result.ts); } catch (error) { return fail('Slack reaction failed', error); } }}, true);

export const connectorToolSchemas: ToolSchema[] = schemas.map((entry) => entry.schema);
export const createConnectorTools = (): ToolDefinition[] => schemas.map((entry) => toDefinition(entry.schema, entry.sideEffecting));
