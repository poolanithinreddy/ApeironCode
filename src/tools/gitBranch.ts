import {execa} from 'execa';
import {z} from 'zod';

import {defineTool} from './types.js';

const GitBranchInputSchema = z.object({
  all: z.boolean().default(true),
});

export const gitBranchTool = defineTool({
  description: 'List local git branches and highlight the active branch.',
  inputSchema: GitBranchInputSchema,
  name: 'git_branch',
  requiresApproval: false,
  riskLevel: 'low',
  async run(rawInput, context) {
    const input = GitBranchInputSchema.parse(rawInput);
    const result = await execa('git', input.all ? ['branch', '--list'] : ['branch', '--show-current'], {
      cwd: context.cwd,
      reject: false,
      signal: context.signal,
    });

    return {
      ok: result.exitCode === 0,
      output: result.stdout,
      summary: 'Git branch information collected',
    };
  },
});