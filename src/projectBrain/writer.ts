import fs from 'node:fs/promises';
import path from 'node:path';

import {ensureDirectory, fileExists, readTextFile, writeTextFile} from '../utils/fs.js';
import type {ProjectBrainFile, ProjectBrainInitPlan, ProjectBrainInitResult} from './types.js';
import {redactProjectBrainText} from './safety.js';

export interface ProjectBrainWriteOptions {
  approved?: boolean;
  dryRun?: boolean;
  mergeStrategy?: 'preserve' | 'backup-and-replace' | 'append';
}

export const backupProjectBrainFile = async (
  filePath: string,
  options: ProjectBrainWriteOptions = {},
): Promise<string | null> => {
  if (!(await fileExists(filePath))) return null;
  const backupPath = `${filePath}.bak.${Date.now()}`;
  if (!options.dryRun) {
    await fs.copyFile(filePath, backupPath);
  }
  return backupPath;
};

export const mergeProjectBrainFile = (
  existing: string,
  proposed: string,
  options: ProjectBrainWriteOptions = {},
): string => {
  const strategy = options.mergeStrategy ?? 'preserve';
  if (strategy === 'append') {
    return redactProjectBrainText(`${existing.trimEnd()}\n\n<!-- ApeironCode proposed update -->\n${proposed.trim()}\n`);
  }
  if (strategy === 'backup-and-replace') {
    return redactProjectBrainText(proposed);
  }
  return redactProjectBrainText(existing);
};

export const writeProjectBrainFile = async (
  file: ProjectBrainFile,
  options: ProjectBrainWriteOptions = {},
): Promise<{created: boolean; preserved: boolean; backupPath?: string}> => {
  if (!options.approved) {
    throw new Error('Project Brain writes require explicit approval.');
  }
  if (file.status === 'conflict') {
    throw new Error(`Project Brain path conflict: ${file.relativePath}`);
  }

  const exists = await fileExists(file.path);
  if (!exists) {
    if (!options.dryRun) await writeTextFile(file.path, redactProjectBrainText(file.content));
    return {created: true, preserved: false};
  }

  if ((options.mergeStrategy ?? 'preserve') === 'preserve') {
    return {created: false, preserved: true};
  }

  const existing = await readTextFile(file.path);
  const backupPath = await backupProjectBrainFile(file.path, options) ?? undefined;
  const merged = mergeProjectBrainFile(existing, file.content, options);
  if (!options.dryRun) await writeTextFile(file.path, merged);
  return {backupPath, created: false, preserved: false};
};

export const applyProjectBrainInitPlan = async (
  plan: ProjectBrainInitPlan,
  options: ProjectBrainWriteOptions = {},
): Promise<ProjectBrainInitResult> => {
  if (!options.approved) {
    return {
      approved: false,
      backedUpFiles: [],
      createdFiles: [],
      dryRun: options.dryRun ?? false,
      message: 'Refused: Project Brain initialization requires --yes or explicit approval.',
      ok: false,
      preservedFiles: [],
      warnings: ['No files were written.'],
    };
  }

  const createdFiles: string[] = [];
  const preservedFiles: string[] = [];
  const backedUpFiles: string[] = [];
  const warnings: string[] = [];

  if (!options.dryRun) {
    await ensureDirectory(plan.brainDir);
    for (const folder of plan.folders) {
      await ensureDirectory(path.join(plan.cwd, folder));
    }
  }

  for (const file of plan.files) {
    try {
      const result = await writeProjectBrainFile(file, options);
      if (result.created) createdFiles.push(file.relativePath);
      if (result.preserved) preservedFiles.push(file.relativePath);
      if (result.backupPath) backedUpFiles.push(path.relative(plan.cwd, result.backupPath).replaceAll(path.sep, '/'));
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    approved: true,
    backedUpFiles,
    createdFiles,
    dryRun: options.dryRun ?? false,
    message: options.dryRun
      ? `Dry run: ${createdFiles.length} files would be created.`
      : `Project Brain initialized: ${createdFiles.length} files created, ${preservedFiles.length} preserved.`,
    ok: warnings.length === 0,
    preservedFiles,
    warnings,
  };
};

export const formatProjectBrainInitResult = (result: ProjectBrainInitResult): string => {
  const lines = [
    result.message,
    `Approved: ${result.approved ? 'yes' : 'no'}`,
    `Dry run: ${result.dryRun ? 'yes' : 'no'}`,
    `Created: ${result.createdFiles.length}`,
    `Preserved: ${result.preservedFiles.length}`,
    `Backups: ${result.backedUpFiles.length}`,
  ];
  if (result.warnings.length > 0) {
    lines.push('Warnings:', ...result.warnings.map((warning) => `- ${warning}`));
  }
  return redactProjectBrainText(lines.join('\n'));
};
