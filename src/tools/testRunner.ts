import path from 'node:path';

import {execaCommand} from 'execa';
import {z} from 'zod';

import {ensureApproved} from '../safety/approvals.js';
import {readJsonFile} from '../utils/fs.js';
import {detectProjectCommand} from './projectCommand.js';
import {defineTool} from './types.js';

const TestRunnerInputSchema = z.object({
  command: z.string().optional(),
});

const detectTestCommand = async (cwd: string): Promise<string> => {
  const packageJson = await readJsonFile<{scripts?: Record<string, string>}>(
    path.join(cwd, 'package.json'),
    {},
  );

  if (packageJson.scripts?.test) {
    return detectProjectCommand(cwd, 'test');
  }

  return 'npm test';
};

export const testRunnerTool = defineTool({
  description: 'Run project tests after approval.',
  inputSchema: TestRunnerInputSchema,
  name: 'test_runner',
  requiresApproval: true,
  riskLevel: 'high',
  async run(rawInput, context) {
    const input = TestRunnerInputSchema.parse(rawInput);
    const command = input.command ?? (await detectTestCommand(context.cwd));

    await ensureApproved(context.approvalManager, {
      kind: 'command',
      message: command,
      resource: command,
      riskLevel: 'medium',
      scope: 'project',
      title: 'Approve test run',
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
      summary: result.exitCode === 0 ? 'Tests passed' : 'Tests failed',
    };
  },
});