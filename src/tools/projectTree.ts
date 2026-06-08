import fg from 'fast-glob';
import {z} from 'zod';

import {defineTool} from './types.js';

const ProjectTreeInputSchema = z.object({
  depth: z.number().int().positive().max(5).default(2),
});

export const projectTreeTool = defineTool({
  description: 'Show a lightweight project tree.',
  inputSchema: ProjectTreeInputSchema,
  name: 'project_tree',
  requiresApproval: false,
  riskLevel: 'low',
  async run(rawInput, context) {
    const input = ProjectTreeInputSchema.parse(rawInput);
    const entries = await fg(['**/*'], {
      cwd: context.cwd,
      deep: input.depth,
      dot: false,
      ignore: context.config.ignoredPaths,
      onlyFiles: false,
    });

    return {
      ok: true,
      output: entries.join('\n'),
      summary: `Project tree collected (${entries.length} entries)`,
    };
  },
});