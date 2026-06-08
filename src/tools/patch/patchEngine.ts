import crypto from 'node:crypto';

import {assessPath} from '../../safety/pathGuard.js';
import type {RiskLevel} from '../../safety/policy.js';
import {AppError} from '../../utils/errors.js';
import {fileExists, readTextFile} from '../../utils/fs.js';
import {buildDiffPreview} from './diffPreview.js';
import type {
  ApplyPatchRequest,
  PatchMatchMode,
  PatchOperation,
  PatchOperationType,
  PreparedPatch,
} from './types.js';

const normalizeOccurrence = (occurrence: PatchMatchMode | undefined, fallback: PatchMatchMode): PatchMatchMode => {
  return occurrence ?? fallback;
};

const ensureMatch = (source: string, target: string, occurrence: PatchMatchMode, label: string): void => {
  const firstIndex = source.indexOf(target);
  if (firstIndex === -1) {
    throw new AppError(`${label} was not found.`, 'PATCH_MATCH_NOT_FOUND');
  }

  if (occurrence === 'unique' && source.indexOf(target, firstIndex + target.length) !== -1) {
    throw new AppError(`${label} is ambiguous.`, 'PATCH_MATCH_AMBIGUOUS');
  }
};

const replaceContent = (
  source: string,
  search: string,
  replace: string,
  occurrence: PatchMatchMode,
): string => {
  ensureMatch(source, search, occurrence, 'Search string');
  if (occurrence === 'all') {
    return source.split(search).join(replace);
  }

  return source.replace(search, replace);
};

const applyOperations = (before: string | null, operations: PatchOperation[]): {after: string | null; operationType: PatchOperationType} => {
  let after = before ?? '';
  let exists = before !== null;
  let primaryOperation: PatchOperationType = operations[0]?.type ?? 'full_rewrite';

  for (const operation of operations) {
    primaryOperation = operation.type;

    switch (operation.type) {
      case 'append':
        if (!exists) {
          throw new AppError('Append requires an existing file. Use create_file first.', 'PATCH_TARGET_MISSING');
        }
        after = `${after}${operation.content}`;
        break;
      case 'create_file':
        if (exists) {
          throw new AppError('Target file already exists.', 'PATCH_TARGET_EXISTS');
        }
        after = operation.content;
        exists = true;
        break;
      case 'delete_file':
        if (!exists) {
          throw new AppError('Target file does not exist.', 'PATCH_TARGET_MISSING');
        }
        return {after: null, operationType: operation.type};
      case 'full_rewrite':
        if (!exists) {
          throw new AppError('Full rewrite requires an existing file. Use create_file to create a new file.', 'PATCH_TARGET_MISSING');
        }
        after = operation.content;
        break;
      case 'insert_after': {
        if (!exists) {
          throw new AppError('Insert-after requires an existing file.', 'PATCH_TARGET_MISSING');
        }
        const occurrence = normalizeOccurrence(operation.occurrence, 'unique');
        ensureMatch(after, operation.anchor, occurrence, 'Anchor');
        const index = after.indexOf(operation.anchor);
        after = `${after.slice(0, index + operation.anchor.length)}${operation.content}${after.slice(index + operation.anchor.length)}`;
        break;
      }
      case 'insert_before': {
        if (!exists) {
          throw new AppError('Insert-before requires an existing file.', 'PATCH_TARGET_MISSING');
        }
        const occurrence = normalizeOccurrence(operation.occurrence, 'unique');
        ensureMatch(after, operation.anchor, occurrence, 'Anchor');
        const index = after.indexOf(operation.anchor);
        after = `${after.slice(0, index)}${operation.content}${after.slice(index)}`;
        break;
      }
      case 'multi_replace': {
        if (!exists) {
          throw new AppError('Multi-replace requires an existing file.', 'PATCH_TARGET_MISSING');
        }
        for (const replacement of operation.replacements) {
          after = replaceContent(after, replacement.search, replacement.replace, normalizeOccurrence(replacement.occurrence, 'unique'));
        }
        break;
      }
      case 'prepend':
        if (!exists) {
          throw new AppError('Prepend requires an existing file. Use create_file first.', 'PATCH_TARGET_MISSING');
        }
        after = `${operation.content}${after}`;
        break;
      case 'search_replace':
        if (!exists) {
          throw new AppError('Search-replace requires an existing file.', 'PATCH_TARGET_MISSING');
        }
        after = replaceContent(after, operation.search, operation.replace, normalizeOccurrence(operation.occurrence, 'unique'));
        break;
      default:
        break;
    }
  }

  return {after, operationType: primaryOperation};
};

const classifyRiskLevel = ({
  addedLines,
  assessment,
  operationType,
  removedLines,
}: {
  addedLines: number;
  assessment: ReturnType<typeof assessPath>;
  operationType: PatchOperationType;
  removedLines: number;
}): RiskLevel => {
  if (operationType === 'delete_file' || assessment.outsideProject || assessment.sensitive) {
    return 'critical';
  }

  if (operationType === 'full_rewrite') {
    return 'high';
  }

  if (operationType === 'create_file') {
    return 'medium';
  }

  const totalChangedLines = addedLines + removedLines;
  if (totalChangedLines <= 6) {
    return 'low';
  }

  if (totalChangedLines <= 40) {
    return 'medium';
  }

  return 'high';
};

export const hashContent = (value: string | null): string | null => {
  if (value === null) {
    return null;
  }

  return crypto.createHash('sha256').update(value).digest('hex');
};

export const preserveLineEndings = (original: string | null, next: string): string => {
  const lineEnding = original?.includes('\r\n') ? '\r\n' : '\n';
  return next.replace(/\r?\n/gu, lineEnding);
};

export const getDisplayFilePath = (assessment: ReturnType<typeof assessPath>): string => {
  return assessment.outsideProject ? assessment.resolvedPath : assessment.relativePath;
};

export const preparePatch = async (request: ApplyPatchRequest): Promise<PreparedPatch> => {
  const assessment = assessPath(request.cwd, request.inputPath);
  if (assessment.outsideProject && !request.allowOutsideWorkspace) {
    throw new AppError('Target file must stay inside the workspace.', 'PATCH_OUTSIDE_WORKSPACE');
  }

  const exists = await fileExists(assessment.resolvedPath);
  const before = exists ? await readTextFile(assessment.resolvedPath) : null;
  const oldHash = hashContent(before);
  if (request.expectedOldHash !== undefined && request.expectedOldHash !== oldHash) {
    throw new AppError('Target file changed before patch preparation.', 'PATCH_STALE_TARGET');
  }

  const applied = applyOperations(before, request.operations);
  const normalizedAfter = applied.after === null
    ? null
    : preserveLineEndings(before, applied.after);
  const diffPreview = buildDiffPreview(getDisplayFilePath(assessment), before ?? '', normalizedAfter ?? '');
  const riskLevel = classifyRiskLevel({
    addedLines: diffPreview.addedLines,
    assessment,
    operationType: applied.operationType,
    removedLines: diffPreview.removedLines,
  });

  return {
    after: normalizedAfter,
    assessment,
    before,
    diffPreview,
    exists,
    oldHash,
    operationType: applied.operationType,
    riskLevel,
  };
};
