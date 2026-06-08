import {z} from 'zod';

import {AppError} from '../utils/errors.js';
import {fileExists} from '../utils/fs.js';
import {applyPatchRequest} from './patch/applyPatch.js';
import {preparePatch} from './patch/patchEngine.js';
import type {PatchOperation} from './patch/types.js';
import {defineTool} from './types.js';

const LegacyReplaceOperationSchema = z.object({
  occurrence: z.enum(['all', 'first', 'unique']).default('unique'),
  op: z.literal('replace'),
  replace: z.string(),
  search: z.string().min(1),
});

const LegacyInsertBeforeOperationSchema = z.object({
  anchor: z.string().min(1),
  content: z.string(),
  occurrence: z.enum(['first', 'unique']).default('unique'),
  op: z.literal('insert_before'),
});

const LegacyInsertAfterOperationSchema = z.object({
  anchor: z.string().min(1),
  content: z.string(),
  occurrence: z.enum(['first', 'unique']).default('unique'),
  op: z.literal('insert_after'),
});

const LegacyAppendOperationSchema = z.object({
  content: z.string(),
  op: z.literal('append'),
});

const LegacyPrependOperationSchema = z.object({
  content: z.string(),
  op: z.literal('prepend'),
});

const LegacyRewriteOperationSchema = z.object({
  content: z.string(),
  op: z.literal('rewrite'),
});

const LegacyDeleteOperationSchema = z.object({
  op: z.literal('delete'),
});

const ModernSearchReplaceOperationSchema = z.object({
  occurrence: z.enum(['all', 'first', 'unique']).optional(),
  replace: z.string(),
  search: z.string().min(1),
  type: z.literal('search_replace'),
});

const ModernMultiReplaceOperationSchema = z.object({
  replacements: z.array(z.object({
    occurrence: z.enum(['all', 'first', 'unique']).optional(),
    replace: z.string(),
    search: z.string().min(1),
  })).min(1),
  type: z.literal('multi_replace'),
});

const ModernInsertBeforeOperationSchema = z.object({
  anchor: z.string().min(1),
  content: z.string(),
  occurrence: z.enum(['first', 'unique']).optional(),
  type: z.literal('insert_before'),
});

const ModernInsertAfterOperationSchema = z.object({
  anchor: z.string().min(1),
  content: z.string(),
  occurrence: z.enum(['first', 'unique']).optional(),
  type: z.literal('insert_after'),
});

const ModernAppendOperationSchema = z.object({
  content: z.string(),
  type: z.literal('append'),
});

const ModernPrependOperationSchema = z.object({
  content: z.string(),
  type: z.literal('prepend'),
});

const ModernFullRewriteOperationSchema = z.object({
  content: z.string(),
  type: z.literal('full_rewrite'),
});

const ModernCreateFileOperationSchema = z.object({
  content: z.string(),
  type: z.literal('create_file'),
});

const ModernDeleteOperationSchema = z.object({
  type: z.literal('delete_file'),
});

const PatchOperationSchema = z.union([
  LegacyReplaceOperationSchema,
  LegacyInsertBeforeOperationSchema,
  LegacyInsertAfterOperationSchema,
  LegacyAppendOperationSchema,
  LegacyPrependOperationSchema,
  LegacyRewriteOperationSchema,
  LegacyDeleteOperationSchema,
  ModernSearchReplaceOperationSchema,
  ModernMultiReplaceOperationSchema,
  ModernInsertBeforeOperationSchema,
  ModernInsertAfterOperationSchema,
  ModernAppendOperationSchema,
  ModernPrependOperationSchema,
  ModernFullRewriteOperationSchema,
  ModernCreateFileOperationSchema,
  ModernDeleteOperationSchema,
]);

const PatchFileInputSchema = z.object({
  allowOutsideWorkspace: z.boolean().default(false),
  createIfMissing: z.boolean().default(false),
  dryRun: z.boolean().default(false),
  operations: z.array(PatchOperationSchema).min(1),
  path: z.string().min(1),
});

const normalizeOperations = async (
  input: z.infer<typeof PatchFileInputSchema>,
  cwd: string,
): Promise<PatchOperation[]> => {
  const targetExists = await fileExists(input.path.startsWith('/') ? input.path : `${cwd}/${input.path}`);
  const normalized = input.operations.map((operation): PatchOperation => {
    if ('type' in operation) {
      return operation;
    }

    switch (operation.op) {
      case 'append':
        return {content: operation.content, type: 'append'};
      case 'delete':
        return {type: 'delete_file'};
      case 'insert_after':
        return {
          anchor: operation.anchor,
          content: operation.content,
          occurrence: operation.occurrence,
          type: 'insert_after',
        };
      case 'insert_before':
        return {
          anchor: operation.anchor,
          content: operation.content,
          occurrence: operation.occurrence,
          type: 'insert_before',
        };
      case 'prepend':
        return {content: operation.content, type: 'prepend'};
      case 'replace':
        return {
          occurrence: operation.occurrence,
          replace: operation.replace,
          search: operation.search,
          type: 'search_replace',
        };
      case 'rewrite':
        return {
          content: operation.content,
          type: targetExists || !input.createIfMissing ? 'full_rewrite' : 'create_file',
        };
      default:
        throw new AppError('Unsupported patch operation.', 'PATCH_OPERATION_UNSUPPORTED');
    }
  });

  if (!targetExists && input.createIfMissing && normalized[0]?.type !== 'create_file') {
    const firstOperation = normalized[0];
    if (!firstOperation) {
      return normalized;
    }

    if (firstOperation.type === 'append' || firstOperation.type === 'prepend') {
      return [{content: firstOperation.content, type: 'create_file'}, ...normalized.slice(1)];
    }
  }

  return normalized;
};

export const patchFileTool = defineTool({
  description: 'Apply a structured patch with diff preview, dry-run support, backups, and persistent edit history.',
  inputSchema: PatchFileInputSchema,
  name: 'patch_file',
  requiresApproval: true,
  riskLevel: 'high',
  async run(rawInput, context) {
    const input = PatchFileInputSchema.parse(rawInput);
    const operations = await normalizeOperations(input, context.cwd);

    if (input.dryRun) {
      const preview = await preparePatch({
        allowOutsideWorkspace: input.allowOutsideWorkspace,
        approvalManager: context.approvalManager,
        cwd: context.cwd,
        inputPath: input.path,
        operations,
        promptOrGoal: context.taskState?.goal,
        sessionId: context.sessionId,
        toolIdentity: 'patch_file',
      });
      return {
        diff: preview.diffPreview.diff,
        metadata: {
          addedLines: preview.diffPreview.addedLines,
          filePath: preview.assessment.outsideProject ? preview.assessment.resolvedPath : preview.assessment.relativePath,
          operation: preview.operationType,
          removedLines: preview.diffPreview.removedLines,
          riskLevel: preview.riskLevel,
        },
        ok: true,
        output: preview.diffPreview.diff,
        summary: `Dry-run patch prepared for ${preview.assessment.relativePath}`,
      };
    }

    const result = await applyPatchRequest({
      allowOutsideWorkspace: input.allowOutsideWorkspace,
      approvalManager: context.approvalManager,
      cwd: context.cwd,
      inputPath: input.path,
      operations,
      promptOrGoal: context.taskState?.goal,
      sessionId: context.sessionId,
      toolIdentity: 'patch_file',
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
      summary: `${result.operation === 'delete_file' ? 'Deleted' : result.operation === 'create_file' ? 'Created' : 'Patched'} ${result.filePath} (edit ${result.editId.slice(0, 8)})`,
    };
  },
});