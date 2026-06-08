import {execa} from 'execa';
import {z} from 'zod';

import {defineTool} from './types.js';

const GitPrDescriptionInputSchema = z.object({
  baseRef: z.string().optional(),
});

export const gitPrDescriptionTool = defineTool({
  description: 'Generate a deterministic PR description draft from git diff stats.',
  inputSchema: GitPrDescriptionInputSchema,
  name: 'git_pr_description',
  requiresApproval: false,
  riskLevel: 'low',
  async run(rawInput, context) {
    const input = GitPrDescriptionInputSchema.parse(rawInput);
    const diffArgs = input.baseRef ? ['diff', '--stat', input.baseRef] : ['diff', '--stat'];
    const namesArgs = input.baseRef ? ['diff', '--name-only', input.baseRef] : ['diff', '--name-only'];
    const [diffStat, changedNames] = await Promise.all([
      execa('git', diffArgs, {cwd: context.cwd, reject: false, signal: context.signal}),
      execa('git', namesArgs, {cwd: context.cwd, reject: false, signal: context.signal}),
    ]);
    const files = changedNames.stdout.split(/\r?\n/u).filter(Boolean);
    const output = [
      '## Summary',
      files.length > 0 ? `- Updates ${files.length} file(s).` : '- No changed files detected.',
      '',
      '## Changed Files',
      ...(files.length > 0 ? files.map((file) => `- ${file}`) : ['- None']),
      '',
      '## Diff Stat',
      '```text',
      diffStat.stdout || 'No diff stat available.',
      '```',
      '',
      '## Tests',
      '- Add the relevant validation results before opening the PR.',
      '',
      '## Risks',
      '- Review changed files and validation gaps before merge.',
    ].join('\n');

    return {
      ok: diffStat.exitCode === 0,
      output,
      summary: 'Generated PR description draft from git diff',
    };
  },
});