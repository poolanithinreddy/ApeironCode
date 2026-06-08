import {execa} from 'execa';
import {z} from 'zod';

import {defineTool} from './types.js';

const GitLogInputSchema = z.object({
  maxCount: z.number().int().positive().max(50).default(10),
});

export const gitLogTool = defineTool({
  description: 'Read recent git commits with a compact one-line format.',
  inputSchema: GitLogInputSchema,
  name: 'git_log',
  requiresApproval: false,
  riskLevel: 'low',
  async run(rawInput, context) {
    const input = GitLogInputSchema.parse(rawInput);
    const result = await execa(
      'git',
      ['log', `--max-count=${input.maxCount}`, '--oneline', '--decorate'],
      {
        cwd: context.cwd,
        reject: false,
        signal: context.signal,
      },
    );

    return {
      ok: result.exitCode === 0,
      output: result.stdout,
      summary: `Collected ${input.maxCount} recent git commits`,
    };
  },
});