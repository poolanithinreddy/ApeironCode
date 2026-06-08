import {execa} from 'execa';
import {z} from 'zod';

import {ensureApproved} from '../safety/approvals.js';
import {defineTool} from './types.js';

const GitCommitInputSchema = z.object({
  message: z.string().min(1),
});

export const gitCommitTool = defineTool({
  description: 'Create a git commit after explicit approval.',
  inputSchema: GitCommitInputSchema,
  name: 'git_commit',
  requiresApproval: true,
  riskLevel: 'high',
  async run(rawInput, context) {
    const input = GitCommitInputSchema.parse(rawInput);

    await ensureApproved(context.approvalManager, {
      kind: 'git',
      message: input.message,
      resource: `git commit -m ${input.message}`,
      riskLevel: 'high',
      scope: 'project',
      title: 'Approve git commit',
    });

    const result = await execa('git', ['commit', '-m', input.message], {
      cwd: context.cwd,
      reject: false,
      signal: context.signal,
    });

    return {
      ok: result.exitCode === 0,
      output: [result.stdout, result.stderr].filter(Boolean).join('\n'),
      summary: result.exitCode === 0 ? 'Commit created' : 'Commit failed',
    };
  },
});