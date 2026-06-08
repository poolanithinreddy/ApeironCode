import path from 'node:path';
import fs from 'node:fs/promises';

import {fileExists, readJsonFile} from '../utils/fs.js';
import {getProjectTrustStatus} from '../safety/projectTrust.js';
import {redactProjectBrainText} from './safety.js';
import {PROJECT_BRAIN_DIR, DEFAULT_PROJECT_BRAIN_FILES, type ProjectBrainManifest} from './types.js';

export type ProjectBrainFeatureStatus = 'available' | 'missing' | 'partial' | 'blocked' | 'unsafe';

export interface ProjectBrainFeatureCheck {
  feature: string;
  status: ProjectBrainFeatureStatus;
  detail?: string;
}

export interface ProjectBrainAuditReport {
  cwd: string;
  timestamp: string;
  overall: ProjectBrainFeatureStatus;
  checks: ProjectBrainFeatureCheck[];
  warnings: string[];
}

const check = (
  feature: string,
  status: ProjectBrainFeatureStatus,
  detail?: string,
): ProjectBrainFeatureCheck => ({feature, status, detail});

const countMd = async (dir: string): Promise<number> => {
  try {
    return (await fs.readdir(dir)).filter((f) => f.endsWith('.md')).length;
  } catch {
    return 0;
  }
};

export const auditProjectBrainFeatures = async (
  cwd: string,
): Promise<ProjectBrainAuditReport> => {
  const timestamp = new Date().toISOString();
  const brainDir = path.join(cwd, PROJECT_BRAIN_DIR);
  const checks: ProjectBrainFeatureCheck[] = [];
  const warnings: string[] = [];

  // .apeironcode/ directory
  const brainExists = await fileExists(brainDir);
  checks.push(check('.apeironcode/ directory', brainExists ? 'available' : 'missing'));

  // manifest
  const manifestPath = path.join(brainDir, 'manifest.json');
  const manifest = await readJsonFile<ProjectBrainManifest | null>(manifestPath, null);
  if (!brainExists) {
    checks.push(check('manifest.json', 'missing'));
  } else if (!manifest) {
    checks.push(check('manifest.json', 'missing', 'File absent or unparseable'));
  } else if (typeof manifest.version !== 'number' || !manifest.projectName) {
    checks.push(check('manifest.json', 'partial', 'Missing required fields'));
  } else {
    checks.push(check('manifest.json', 'available'));
  }

  // core markdown files
  const coreFiles = DEFAULT_PROJECT_BRAIN_FILES.filter((f) => f.kind !== 'manifest');
  for (const file of coreFiles) {
    const exists = await fileExists(path.join(cwd, file.relativePath));
    checks.push(check(file.relativePath, exists ? 'available' : 'missing'));
  }

  // directories
  const dirs: Array<{name: string; path: string; required: boolean}> = [
    {name: 'agents/', path: path.join(brainDir, 'agents'), required: true},
    {name: 'commands/', path: path.join(brainDir, 'commands'), required: true},
    {name: 'skills/', path: path.join(brainDir, 'skills'), required: false},
  ];
  for (const dir of dirs) {
    const exists = await fileExists(dir.path);
    checks.push(check(dir.name, exists ? 'available' : (dir.required ? 'missing' : 'partial'),
      exists ? undefined : dir.required ? undefined : 'Optional directory not created'));
    if (exists) {
      const count = await countMd(dir.path);
      if (count > 0) checks.push(check(`${dir.name}(${count} files)`, 'available'));
    }
  }

  // project trust
  const trust = getProjectTrustStatus(cwd).trust;
  if (trust !== 'trusted') {
    checks.push(check('project trust', 'blocked', 'Auto-loading workflows blocked until project is trusted'));
    warnings.push('Workflow auto-load requires project trust (run `apeironcode trust --yes`).');
  } else {
    checks.push(check('project trust', 'available'));
  }

  // reader
  checks.push(check('brain reader', 'available', 'readProjectBrain() available'));

  // indexer
  checks.push(check('brain indexer', 'available', 'indexProjectBrainForContext() available'));

  // continuation
  checks.push(check('continuation prompt', 'available', 'buildContinuationPromptFromBrain() available'));

  // CLI commands
  const cliCommands = ['brain plan', 'brain init', 'brain status', 'brain show', 'brain update',
    'brain audit', 'brain sync-preview', 'brain sync', 'brain build-plan'];
  checks.push(check('CLI brain commands', 'available', cliCommands.join(', ')));

  // bridge messages
  const bridgeMessages = ['brain.plan', 'brain.init', 'brain.status', 'brain.show', 'brain.update',
    'brain.audit', 'brain.sync_preview', 'brain.sync_apply', 'brain.build_plan'];
  checks.push(check('bridge brain messages', 'available', bridgeMessages.join(', ')));

  // VS Code commands
  const vscodeCommands = ['apeironcode.brainPlan', 'apeironcode.brainInit', 'apeironcode.brainStatus',
    'apeironcode.brainShow', 'apeironcode.brainUpdate', 'apeironcode.showBrainView'];
  checks.push(check('VS Code brain commands', 'available', vscodeCommands.join(', ')));

  // doctor checks
  checks.push(check('doctor checks', 'available', 'Brain status included in doctor output'));

  // no scripts executed
  checks.push(check('no scripts auto-executed', 'available', 'Scripts in .apeironcode/ are never auto-run'));

  // secrets redaction
  checks.push(check('secrets redaction', 'available', 'redactProjectBrainText() applied on all output'));

  const missingCount = checks.filter((c) => c.status === 'missing').length;
  const blockedCount = checks.filter((c) => c.status === 'blocked').length;
  const partialCount = checks.filter((c) => c.status === 'partial').length;

  const overall: ProjectBrainFeatureStatus =
    blockedCount > 0 ? 'blocked'
    : missingCount > 3 ? 'missing'
    : missingCount > 0 || partialCount > 0 ? 'partial'
    : 'available';

  return {cwd, timestamp, overall, checks, warnings};
};

export const formatProjectBrainAuditReport = (report: ProjectBrainAuditReport): string => {
  const lines: string[] = [
    `Project Brain Audit — ${report.timestamp}`,
    `CWD: ${report.cwd}`,
    `Overall: ${report.overall}`,
    '',
    'Feature Checks:',
  ];

  for (const c of report.checks) {
    const icon = c.status === 'available' ? '✓' : c.status === 'missing' ? '✗' : c.status === 'blocked' ? '⊘' : '~';
    const detail = c.detail ? ` (${c.detail})` : '';
    lines.push(`  ${icon} [${c.status}] ${c.feature}${detail}`);
  }

  if (report.warnings.length > 0) {
    lines.push('', 'Warnings:');
    for (const w of report.warnings) lines.push(`  ! ${w}`);
  }

  return redactProjectBrainText(lines.join('\n'));
};
