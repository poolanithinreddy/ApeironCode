import type {SlashCommandDefinition} from './shared.js';
import process from 'node:process';

import {appendSlashMessage} from './format.js';

export const createGitCommands = (): SlashCommandDefinition[] => [
{
    description: 'Generate a commit message and commit with approval',
    examples: ['/commit'],
    name: '/commit',
    usage: '/commit',
    async run(_args, context) {
      const result = await context.agent.run({
        mode: 'commit',
        prompt: 'Generate one concise conventional commit message for the current git diff. Respond with the commit message only.',
      });
      context.refreshSessionState();
      const commitMessage = result.finalMessage.content.trim().split('\n')[0]?.trim();
      if (!commitMessage) {
        appendSlashMessage(context, 'Could not derive a commit message from the current diff.');
        return;
      }

      await context.runTool('git_commit', {message: commitMessage});
    },
  },
{
    description: 'Generate a PR description',
    name: '/pr',
    usage: '/pr',
    async run(_args, context) {
      await context.runTool('git_pr_description', {});
    },
  },
{
    description: 'Inspect GitHub connector readiness',
    examples: ['/github status', '/github issue create --title Test --body Body --dry-run'],
    name: '/github',
    usage: '/github status|issue create|pr create',
    async run(args, context) {
      const {formatConnectorStatus} = await import('../../connectors/github/format.js');
      const {listConnectorStatuses} = await import('../../connectors/registry.js');
      const {formatGitHubWritePreview} = await import('../../connectors/github/format.js');
      const [resource, action, ...rest] = args;
      if (resource === 'issue' && action === 'create') {
        const titleIndex = rest.indexOf('--title');
        const bodyIndex = rest.indexOf('--body');
        const title = titleIndex >= 0 ? rest[titleIndex + 1] : undefined;
        const body = bodyIndex >= 0 ? rest[bodyIndex + 1] : '';
        if (!title) {
          context.appendLocalAssistantMessage('Usage: /github issue create --title <title> --body <body> [--dry-run]');
          return;
        }
        context.appendLocalAssistantMessage(`${formatGitHubWritePreview({body: [`Title: ${title}`, '', body].join('\n'), target: 'new issue', type: 'issue-create'})}\nNot posted from slash preview. Use CLI with approval to post.`);
        return;
      }
      if (resource === 'pr' && action === 'create') {
        const titleIndex = rest.indexOf('--title');
        const baseIndex = rest.indexOf('--base');
        const headIndex = rest.indexOf('--head');
        const bodyIndex = rest.indexOf('--body');
        const title = titleIndex >= 0 ? rest[titleIndex + 1] : undefined;
        const base = baseIndex >= 0 ? rest[baseIndex + 1] : undefined;
        const head = headIndex >= 0 ? rest[headIndex + 1] : undefined;
        const body = bodyIndex >= 0 ? rest[bodyIndex + 1] : '';
        if (!title || !base || !head) {
          context.appendLocalAssistantMessage('Usage: /github pr create --title <title> --body <body> --base main --head branch [--dry-run]');
          return;
        }
        context.appendLocalAssistantMessage(`${formatGitHubWritePreview({body: [`Title: ${title}`, `Branches: ${head} -> ${base}`, '', body].join('\n'), target: 'new pull request', type: 'pr-create'})}\nNot posted from slash preview. Use CLI with approval to post.`);
        return;
      }
      if (resource === 'pr' && (action === 'summary' || action === 'review') && rest[0]) {
        const {GitHubClient} = await import('../../connectors/github/client.js');
        const {detectGitHubRepo} = await import('../../connectors/github/repos.js');
        const {buildLocalPrReviewReport, buildPrSummaryReport, getGitHubPull, listGitHubPullFiles} = await import('../../connectors/github/pulls.js');
        const repo = await detectGitHubRepo(context.cwd);
        if (!repo) {
          context.appendLocalAssistantMessage('No GitHub remote detected.');
          return;
        }
        const token = process.env.GITHUB_TOKEN;
        if (!token) {
          context.appendLocalAssistantMessage('GITHUB_TOKEN is not set. Set it to enable GitHub PR reads; the token will not be printed.');
          return;
        }
        const client = new GitHubClient({env: {GITHUB_TOKEN: token}, repo});
        const number = Number.parseInt(rest[0], 10);
        const [pull, files] = await Promise.all([getGitHubPull(client, number), listGitHubPullFiles(client, number)]);
        const summary = buildPrSummaryReport(pull, files);
        context.appendLocalAssistantMessage(action === 'review' ? buildLocalPrReviewReport(pull, summary) : summary);
        return;
      }
      if (resource === 'actions' || (resource === 'ci' && action === 'explain')) {
        const {GitHubClient} = await import('../../connectors/github/client.js');
        const {detectGitHubRepo} = await import('../../connectors/github/repos.js');
        const {formatGitHubActionsRuns, formatGitHubCiExplanation, listGitHubActionsJobs, listGitHubActionsRuns} = await import('../../connectors/github/actions.js');
        const repo = await detectGitHubRepo(context.cwd);
        if (!repo) {
          context.appendLocalAssistantMessage('No GitHub remote detected.');
          return;
        }
        const token = process.env.GITHUB_TOKEN;
        if (!token) {
          context.appendLocalAssistantMessage('GITHUB_TOKEN is not set. Set it to enable GitHub Actions reads; the token will not be printed.');
          return;
        }
        const client = new GitHubClient({env: {GITHUB_TOKEN: token}, repo});
        if (resource === 'actions') {
          const runId = action ? Number.parseInt(action, 10) : undefined;
          context.appendLocalAssistantMessage(runId ? formatGitHubCiExplanation(await listGitHubActionsJobs(client, runId), String(runId)) : formatGitHubActionsRuns(await listGitHubActionsRuns(client)));
          return;
        }
        const requestedRun = rest[0] ? Number.parseInt(rest[0], 10) : undefined;
        const runId = requestedRun ?? (await listGitHubActionsRuns(client)).find((run) => run.conclusion === 'failure')?.id;
        context.appendLocalAssistantMessage(runId ? formatGitHubCiExplanation(await listGitHubActionsJobs(client, runId), String(runId)) : 'No failed GitHub Actions run found in the latest runs.');
        return;
      }
      context.appendLocalAssistantMessage((await listConnectorStatuses(context.cwd)).map(formatConnectorStatus).join('\n\n'));
    },
  },
];
