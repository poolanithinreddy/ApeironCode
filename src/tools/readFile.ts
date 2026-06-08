import fs from 'node:fs/promises';

import {z} from 'zod';

import {ensureApproved} from '../safety/approvals.js';
import {assessPath} from '../safety/pathGuard.js';
import {formatBytes} from '../utils/format.js';
import {defineTool} from './types.js';

const ReadFileInputSchema = z.object({
  endLine: z.number().int().positive().optional(),
  lineNumbers: z.boolean().default(false),
  path: z.string().min(1),
  startLine: z.number().int().positive().optional(),
});

const sliceByLines = (
  content: string,
  startLine?: number,
  endLine?: number,
): string => {
  if (!startLine && !endLine) {
    return content;
  }

  const lines = content.split(/\r?\n/u);
  return lines.slice((startLine ?? 1) - 1, endLine ?? lines.length).join('\n');
};

const withLineNumbers = (content: string, startLine = 1): string => {
  return content
    .split(/\r?\n/u)
    .map((line, index) => `${startLine + index}: ${line}`)
    .join('\n');
};

export const readFileTool = defineTool({
  description: 'Read a text file safely.',
  inputSchema: ReadFileInputSchema,
  name: 'read_file',
  requiresApproval: false,
  riskLevel: 'low',
  async run(rawInput, context) {
    const input = ReadFileInputSchema.parse(rawInput);
    const assessment = assessPath(context.cwd, input.path);
    const fileStat = await fs.stat(assessment.resolvedPath);

    if (assessment.sensitive || assessment.outsideProject || fileStat.size > context.config.maxFileSize) {
      await ensureApproved(context.approvalManager, {
        details: `Path: ${assessment.resolvedPath}`,
        kind: assessment.sensitive ? 'secret' : 'read',
        message: `Read ${assessment.relativePath} (${formatBytes(fileStat.size)}).`,
        resource: assessment.relativePath,
        riskLevel: assessment.sensitive || assessment.outsideProject ? 'high' : 'medium',
        scope: assessment.sensitive ? 'secret' : assessment.outsideProject ? 'external' : 'project',
        title: 'Approve file read',
      });
    }

    const buffer = await fs.readFile(assessment.resolvedPath);
    const binaryPrefix = buffer.subarray(0, 512);
    if (binaryPrefix.includes(0)) {
      return {
        ok: true,
        output: `Binary or non-text file detected at ${assessment.relativePath}.`,
        summary: `Skipped binary file ${assessment.relativePath}`,
        metadata: {
          binary: true,
          path: assessment.resolvedPath,
          size: fileStat.size,
        },
      };
    }

    if (assessment.relativePath.toLowerCase().endsWith('.pdf')) {
      return {
        ok: true,
        output: 'PDF extraction is not supported in the current build. Use a dedicated text extraction step first.',
        summary: `PDF read unsupported for ${assessment.relativePath}`,
        metadata: {
          path: assessment.resolvedPath,
          size: fileStat.size,
        },
      };
    }

    const content = buffer.toString('utf8');
    const output = sliceByLines(content, input.startLine, input.endLine);
    const rendered = input.lineNumbers
      ? withLineNumbers(output, input.startLine ?? 1)
      : output;

    return {
      ok: true,
      output: rendered,
      summary: `Read ${assessment.relativePath}`,
      metadata: {
        path: assessment.resolvedPath,
      },
    };
  },
});