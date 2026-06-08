import {execaCommand} from 'execa';
import {z} from 'zod';

import {ensureApproved} from '../safety/approvals.js';
import {detectProjectCommand} from './projectCommand.js';
import {defineTool} from './types.js';

const BuildRunnerInputSchema = z.object({
  command: z.string().optional(),
});

export const buildRunnerTool = defineTool({
  description: 'Run the project build command after approval.',
  inputSchema: BuildRunnerInputSchema,
  name: 'build_runner',
  requiresApproval: true,
  riskLevel: 'high',
  async run(rawInput, context) {
    const input = BuildRunnerInputSchema.parse(rawInput);
    const command = input.command ?? (await detectProjectCommand(context.cwd, 'build'));

    await ensureApproved(context.approvalManager, {
      kind: 'command',
      message: command,
      resource: command,
      riskLevel: 'medium',
      scope: 'project',
      title: 'Approve build run',
    });

    const result = await execaCommand(command, {
      all: true,
      cwd: context.cwd,
      reject: false,
      shell: true,
      signal: context.signal,
      timeout: 60_000,
    });

    return {
      ok: result.exitCode === 0,
      output: result.all ?? [result.stdout, result.stderr].filter(Boolean).join('\n'),
      summary: result.exitCode === 0 ? 'Build passed' : 'Build failed',
    };
  },
});