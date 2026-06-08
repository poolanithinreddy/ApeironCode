import {z} from 'zod';

import {revertPatchRequest} from './patch/revertPatch.js';
import {defineTool} from './types.js';

const RevertPatchInputSchema = z.object({
  editId: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  target: z.enum(['last']).optional(),
}).refine((value) => {
  const specified = [value.editId, value.path, value.target].filter(Boolean);
  return specified.length === 1 || specified.length === 0;
}, 'Specify either target=last, editId, or path.');

const formatRevertMethod = (method?: string): string => {
  if (!method || method === 'backup') {
    return '';
  }

  return method === 'delete-created-file'
    ? ' via delete-created-file fallback'
    : ` via ${method} fallback`;
};

export const revertPatchTool = defineTool({
  description: 'Revert the latest edit, a specific edit id, or the latest edit for a file path using edit history.',
  inputSchema: RevertPatchInputSchema,
  name: 'revert_patch',
  requiresApproval: true,
  riskLevel: 'critical',
  async run(rawInput, context) {
    const input = RevertPatchInputSchema.parse(rawInput);
    const result = await revertPatchRequest({
      approvalManager: context.approvalManager,
      cwd: context.cwd,
      editId: input.editId,
      filePath: input.path,
      promptOrGoal: context.taskState?.goal,
      sessionId: context.sessionId,
      target: input.target,
      toolIdentity: 'revert_patch',
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
        revertMethod: result.revertMethod,
      },
      ok: true,
      output: result.filePath,
      summary: `Reverted ${result.filePath} (edit ${result.editId.slice(0, 8)})${formatRevertMethod(result.revertMethod)}`,
    };
  },
});
