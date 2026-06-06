import {z} from 'zod';

import {assessPath} from '../safety/pathGuard.js';
import {fileExists} from '../utils/fs.js';
import {preparePatch} from './patch/patchEngine.js';
import {applyPatchRequest} from './patch/applyPatch.js';
import {defineTool} from './types.js';

const WriteFileInputSchema = z.object({
  content: z.string(),
  path: z.string().min(1),
});

export const writeFileTool = defineTool({
  description: 'Write a file after previewing the diff, capturing backups, and recording edit history.',
  inputSchema: WriteFileInputSchema,
  name: 'write_file',
  requiresApproval: true,
  riskLevel: 'high',
  async run(rawInput, context) {
    const input = WriteFileInputSchema.parse(rawInput);
    const assessment = assessPath(context.cwd, input.path);
    const exists = await fileExists(assessment.resolvedPath);
    const prepared = await preparePatch({
      approvalManager: context.approvalManager,
      cwd: context.cwd,
      inputPath: input.path,
      operations: [{content: input.content, type: exists ? 'full_rewrite' : 'create_file'}],
      promptOrGoal: context.taskState?.goal,
      sessionId: context.sessionId,
      toolIdentity: 'write_file',
    });

    const result = await applyPatchRequest({
      approvalManager: context.approvalManager,
      cwd: context.cwd,
      inputPath: input.path,
      operations: [{content: input.content, type: prepared.exists ? 'full_rewrite' : 'create_file'}],
      promptOrGoal: context.taskState?.goal,
      sessionId: context.sessionId,
      toolIdentity: 'write_file',
    });

    return {
      diff: result.diff,
      metadata: {
        addedLines: result.addedLines,
        backupPath: result.backupPath,
        editId: result.editId,
        filePath: result.filePath,
        newHash: result.newHash,
        oldHash: result.oldHash,
        operation: result.operation,
        removedLines: result.removedLines,
      },
      ok: true,
      output: result.filePath,
      summary: `${result.operation === 'create_file' ? 'Created' : 'Updated'} ${result.filePath} (edit ${result.editId.slice(0, 8)})`,
    };
  },
});