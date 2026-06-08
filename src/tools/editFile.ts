import {z} from 'zod';

import {applyPatchRequest} from './patch/applyPatch.js';
import {defineTool} from './types.js';

const EditFileInputSchema = z.object({
  path: z.string().min(1),
  replace: z.string(),
  search: z.string().min(1),
});

export const editFileTool = defineTool({
  description: 'Apply a unique search-and-replace edit with diff preview, backup, and edit history.',
  inputSchema: EditFileInputSchema,
  name: 'edit_file',
  requiresApproval: true,
  riskLevel: 'high',
  async run(rawInput, context) {
    const input = EditFileInputSchema.parse(rawInput);
    const result = await applyPatchRequest({
      approvalManager: context.approvalManager,
      cwd: context.cwd,
      inputPath: input.path,
      operations: [{
        occurrence: 'unique',
        replace: input.replace,
        search: input.search,
        type: 'search_replace',
      }],
      promptOrGoal: context.taskState?.goal,
      sessionId: context.sessionId,
      toolIdentity: 'edit_file',
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
      summary: `Edited ${result.filePath} (edit ${result.editId.slice(0, 8)})`,
    };
  },
});