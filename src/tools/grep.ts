import fs from 'node:fs/promises';
import path from 'node:path';

import {execa} from 'execa';
import fg from 'fast-glob';
import {z} from 'zod';

import {ensureApproved} from '../safety/approvals.js';
import {assessPath} from '../safety/pathGuard.js';
import {defineTool} from './types.js';

const GrepInputSchema = z.object({
  contextLines: z.number().int().min(0).max(10).default(0),
  exclude: z.array(z.string()).optional(),
  fixedString: z.boolean().default(true),
  include: z.array(z.string()).optional(),
  isRegex: z.boolean().default(false),
  maxResults: z.number().int().positive().max(500).default(200),
  path: z.string().min(1).default('.'),
  pattern: z.string().min(1),
});

const canUseRipgrep = async (): Promise<boolean> => {
  const result = await execa('rg', ['--version'], {reject: false});
  return result.exitCode === 0;
};

export const grepTool = defineTool({
  description: 'Search across files using ripgrep when available.',
  inputSchema: GrepInputSchema,
  name: 'grep',
  requiresApproval: false,
  riskLevel: 'low',
  async run(rawInput, context) {
    const input = GrepInputSchema.parse(rawInput);
    const assessment = assessPath(context.cwd, input.path);

    if (assessment.outsideProject || assessment.sensitive) {
      await ensureApproved(context.approvalManager, {
        kind: assessment.sensitive ? 'secret' : 'read',
        message: `Search for ${input.pattern} in ${assessment.resolvedPath}.`,
        riskLevel: 'high',
        scope: assessment.sensitive ? 'secret' : 'external',
        title: 'Approve search',
      });
    }

    if (await canUseRipgrep()) {
      const args = ['--line-number', '--with-filename', '--color', 'never'];
      if (input.fixedString && !input.isRegex) {
        args.push('--fixed-strings');
      }
      if (input.contextLines > 0) {
        args.push('--context', `${input.contextLines}`);
      }
      args.push('--max-count', `${input.maxResults}`);
      for (const pattern of input.include ?? []) {
        args.push('--glob', pattern);
      }
      for (const pattern of input.exclude ?? []) {
        args.push('--glob', `!${pattern}`);
      }
      args.push(input.pattern, assessment.resolvedPath);

      const result = await execa('rg', args, {
        reject: false,
        signal: context.signal,
      });

      return {
        ok: result.exitCode === 0 || result.exitCode === 1,
        output: result.stdout,
        summary: result.stdout ? 'Search completed' : 'No matches found',
      };
    }

    const matches: string[] = [];
    const files = await fg(input.include ?? ['**/*'], {
      cwd: assessment.resolvedPath,
      ignore: [...context.config.ignoredPaths, ...(input.exclude ?? [])],
      onlyFiles: true,
    });
    const matcher = input.isRegex ? new RegExp(input.pattern, 'u') : null;

    for (const relativePath of files) {
      const absolutePath = path.join(assessment.resolvedPath, relativePath);
      const content = await fs.readFile(absolutePath, 'utf8');
      const lines = content.split(/\r?\n/u);
      lines.forEach((line, index) => {
        const matched = matcher ? matcher.test(line) : line.includes(input.pattern);
        if (matched) {
          const start = Math.max(0, index - input.contextLines);
          const end = Math.min(lines.length, index + input.contextLines + 1);
          const contextBlock = lines.slice(start, end).join('\n');
          matches.push(`${relativePath}:${index + 1}:${contextBlock}`);
        }
      });
      if (matches.length >= input.maxResults) {
        break;
      }
    }

    return {
      ok: true,
      output: matches.slice(0, input.maxResults).join('\n'),
      summary: matches.length > 0 ? 'Search completed' : 'No matches found',
    };
  },
});