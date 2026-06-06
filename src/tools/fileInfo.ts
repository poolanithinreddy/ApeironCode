import fs from 'node:fs/promises';
import path from 'node:path';

import {z} from 'zod';

import {assessPath} from '../safety/pathGuard.js';
import {formatBytes} from '../utils/format.js';
import {defineTool} from './types.js';

const FileInfoInputSchema = z.object({
  path: z.string().min(1),
});

export const fileInfoTool = defineTool({
  description: 'Read file metadata such as size, timestamps, extension, and workspace location.',
  inputSchema: FileInfoInputSchema,
  name: 'file_info',
  requiresApproval: false,
  riskLevel: 'low',
  async run(rawInput, context) {
    const input = FileInfoInputSchema.parse(rawInput);
    const assessment = assessPath(context.cwd, input.path);
    const stat = await fs.stat(assessment.resolvedPath);
    const payload = {
      extension: path.extname(assessment.resolvedPath).toLowerCase(),
      isDirectory: stat.isDirectory(),
      modifiedAt: stat.mtime.toISOString(),
      path: assessment.relativePath,
      resolvedPath: assessment.resolvedPath,
      size: stat.size,
      sizeLabel: formatBytes(stat.size),
      outsideProject: assessment.outsideProject,
      sensitive: assessment.sensitive,
    };

    return {
      metadata: payload,
      ok: true,
      output: JSON.stringify(payload, null, 2),
      summary: `Metadata collected for ${assessment.relativePath}`,
    };
  },
});