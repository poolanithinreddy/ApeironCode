import {execa} from 'execa';
import {z} from 'zod';

import {defineTool} from './types.js';

const GitDiffInputSchema = z.object({
  path: z.string().optional(),
});

export const gitDiffTool = defineTool({
  description: 'Show the current git diff.',
  inputSchema: GitDiffInputSchema,
  name: 'git_diff',
  requiresApproval: false,
  riskLevel: 'low',
  async run(rawInput, context) {
    const input = GitDiffInputSchema.parse(rawInput);
    const args = ['diff'];
    if (input.path) {
      args.push('--', input.path);
    }

    const result = await execa('git', args, {
      cwd: context.cwd,
      reject: false,
      signal: context.signal,
    });

    return {
      ok: result.exitCode === 0,
      output: result.stdout,
      summary: result.stdout ? 'Git diff collected' : 'Working tree is clean',
    };
  },
});