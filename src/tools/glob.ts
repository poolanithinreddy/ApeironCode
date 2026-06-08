import fg from 'fast-glob';
import {z} from 'zod';

import {ensureApproved} from '../safety/approvals.js';
import {assessPath} from '../safety/pathGuard.js';
import {defineTool} from './types.js';

const GlobInputSchema = z.object({
  cwd: z.string().default('.'),
  maxResults: z.number().int().positive().max(500).default(100),
  pattern: z.string().min(1),
});

export const globTool = defineTool({
  description: 'Match files by glob pattern while respecting ignore rules.',
  inputSchema: GlobInputSchema,
  name: 'glob',
  requiresApproval: false,
  riskLevel: 'low',
  async run(rawInput, context) {
    const input = GlobInputSchema.parse(rawInput);
    const assessment = assessPath(context.cwd, input.cwd);

    if (assessment.outsideProject || assessment.sensitive) {
      await ensureApproved(context.approvalManager, {
        kind: assessment.sensitive ? 'secret' : 'read',
        message: `Run glob ${input.pattern} in ${assessment.resolvedPath}.`,
        resource: assessment.relativePath,
        riskLevel: 'high',
        scope: assessment.sensitive ? 'secret' : 'external',
        title: 'Approve glob search',
      });
    }

    const matches = await fg([input.pattern], {
      cwd: assessment.resolvedPath,
      dot: false,
      ignore: context.config.ignoredPaths,
      onlyFiles: false,
    });
    const limited = matches.slice(0, input.maxResults);

    return {
      ok: true,
      output: limited.join('\n'),
      summary: `Matched ${matches.length} entries${matches.length > limited.length ? ` (showing ${limited.length})` : ''}`,
      metadata: {
        count: matches.length,
      },
    };
  },
});