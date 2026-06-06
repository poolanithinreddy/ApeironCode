import {execa} from 'execa';
import {z} from 'zod';

import {defineTool} from './types.js';

const GitStatusInputSchema = z.object({}).default({});

export const gitStatusTool = defineTool({
  description: 'Show the current git status in porcelain form.',
  inputSchema: GitStatusInputSchema,
  name: 'git_status',
  requiresApproval: false,
  riskLevel: 'low',
  async run(_rawInput, context) {
    const result = await execa('git', ['status', '--short', '--branch'], {
      cwd: context.cwd,
      reject: false,
      signal: context.signal,
    });

    return {
      ok: result.exitCode === 0,
      output: result.stdout,
      summary: result.stdout ? 'Git status collected' : 'Git status is empty',
    };
  },
});