import fg from 'fast-glob';
import {z} from 'zod';

import {ensureApproved} from '../safety/approvals.js';
import {assessPath} from '../safety/pathGuard.js';
import {defineTool} from './types.js';

const ListFilesInputSchema = z.object({
  depth: z.number().int().positive().max(10).optional(),
  dirsFirst: z.boolean().default(true),
  maxEntries: z.number().int().positive().max(500).default(200),
  path: z.string().min(1).default('.'),
  treeView: z.boolean().default(true),
});

const formatTree = (entries: string[]): string => {
  return entries
    .map((entry) => {
      const depth = entry.split('/').length - 1;
      return `${'  '.repeat(depth)}${entry}`;
    })
    .join('\n');
};

export const listFilesTool = defineTool({
  description: 'List files recursively while respecting ignore rules.',
  inputSchema: ListFilesInputSchema,
  name: 'list_files',
  requiresApproval: false,
  riskLevel: 'low',
  async run(rawInput, context) {
    const input = ListFilesInputSchema.parse(rawInput);
    const assessment = assessPath(context.cwd, input.path);

    if (assessment.outsideProject || assessment.sensitive) {
      await ensureApproved(context.approvalManager, {
        kind: assessment.sensitive ? 'secret' : 'read',
        message: `List files under ${assessment.resolvedPath}.`,
        riskLevel: 'high',
        scope: assessment.sensitive ? 'secret' : 'external',
        title: 'Approve file listing',
      });
    }

    const entries = await fg(['**/*'], {
      cwd: assessment.resolvedPath,
      deep: input.depth,
      dot: false,
      ignore: context.config.ignoredPaths,
      onlyFiles: false,
    });
    const sorted = [...entries].sort((left, right) => {
      if (!input.dirsFirst) {
        return left.localeCompare(right);
      }

      const leftIsDirLike = !left.includes('.') || left.endsWith('/');
      const rightIsDirLike = !right.includes('.') || right.endsWith('/');
      if (leftIsDirLike !== rightIsDirLike) {
        return leftIsDirLike ? -1 : 1;
      }

      return left.localeCompare(right);
    });
    const limited = sorted.slice(0, input.maxEntries);
    const output = input.treeView ? formatTree(limited) : limited.join('\n');

    return {
      ok: true,
      output,
      summary: `Listed ${entries.length} entries${entries.length > limited.length ? ` (showing ${limited.length})` : ''}`,
      metadata: {
        entries: limited,
      },
    };
  },
});