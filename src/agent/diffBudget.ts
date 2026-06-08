import {execa} from 'execa';
import path from 'node:path';

export interface DiffStats {
  addedLines: number;
  changedFiles: string[];
  deletedLines: number;
  diffBytes: number;
  generatedFiles: string[];
  highRiskFiles: string[];
}

export interface DiffBudgetPolicy {
  maxChangedFiles: number;
  maxChangedLines: number;
  maxDeletedLines: number;
  maxDiffBytes: number;
  protectedPaths?: string[];
}

export interface DiffBudgetDecision {
  blocked: boolean;
  requiresApproval: boolean;
  warnings: string[];
}

const DEFAULT_PROTECTED = ['.env', '.npmrc', '.ssh/', 'id_rsa', 'id_ed25519'];
const GENERATED_RE = /(^|\/)(dist|build|coverage|generated)(\/|$)|\.(?:min\.js|snap)$/u;
const RISKY_RE = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|package\.json|tsconfig\.json|[^/]+\.config\.[jt]s)$/u;

export const calculateDiffStats = async (
  cwd: string,
  changedFiles: string[],
): Promise<DiffStats> => {
  const uniqueFiles = Array.from(new Set(changedFiles)).sort();
  let addedLines = 0;
  let deletedLines = 0;
  let diffBytes = 0;
  const result = await execa('git', ['diff', '--numstat', '--', ...uniqueFiles], {cwd, reject: false});
  if (result.exitCode === 0 && result.stdout.trim()) {
    for (const line of result.stdout.split(/\r?\n/u)) {
      const [added, deleted] = line.split(/\s+/u);
      addedLines += Number.parseInt(added ?? '0', 10) || 0;
      deletedLines += Number.parseInt(deleted ?? '0', 10) || 0;
    }
  }
  const diff = await execa('git', ['diff', '--', ...uniqueFiles], {cwd, reject: false});
  if (diff.exitCode === 0) diffBytes = Buffer.byteLength(diff.stdout, 'utf8');

  return {
    addedLines,
    changedFiles: uniqueFiles,
    deletedLines,
    diffBytes,
    generatedFiles: uniqueFiles.filter((file) => GENERATED_RE.test(file)),
    highRiskFiles: uniqueFiles.filter((file) => RISKY_RE.test(file)),
  };
};

export const enforceDiffBudget = (
  stats: DiffStats,
  policy: DiffBudgetPolicy,
): DiffBudgetDecision => {
  const warnings: string[] = [];
  const protectedPaths = [...DEFAULT_PROTECTED, ...(policy.protectedPaths ?? [])];
  const protectedHits = stats.changedFiles.filter((file) =>
    protectedPaths.some((protectedPath) => file === protectedPath || file.startsWith(`${protectedPath.replace(/\/$/u, '')}/`)));
  if (protectedHits.length > 0) warnings.push(`Protected path changed: ${protectedHits.join(', ')}`);
  if (stats.changedFiles.length > policy.maxChangedFiles) warnings.push(`Changed file count ${stats.changedFiles.length} exceeds ${policy.maxChangedFiles}`);
  if (stats.addedLines + stats.deletedLines > policy.maxChangedLines) warnings.push(`Changed lines exceed ${policy.maxChangedLines}`);
  if (stats.deletedLines > policy.maxDeletedLines) warnings.push(`Deleted lines ${stats.deletedLines} exceed ${policy.maxDeletedLines}`);
  if (stats.diffBytes > policy.maxDiffBytes) warnings.push(`Diff bytes ${stats.diffBytes} exceed ${policy.maxDiffBytes}`);
  if (stats.generatedFiles.length > 0) warnings.push(`Generated files changed: ${stats.generatedFiles.join(', ')}`);
  if (stats.highRiskFiles.length > 0) warnings.push(`Package/config files changed: ${stats.highRiskFiles.join(', ')}`);
  return {
    blocked: protectedHits.length > 0 || stats.changedFiles.length > policy.maxChangedFiles || stats.deletedLines > policy.maxDeletedLines || stats.diffBytes > policy.maxDiffBytes,
    requiresApproval: stats.highRiskFiles.length > 0 || stats.generatedFiles.length > 0 || warnings.length > 0,
    warnings,
  };
};

export const formatDiffBudgetReport = (stats: DiffStats): string => [
  `Files changed: ${stats.changedFiles.length}`,
  `Lines: +${stats.addedLines} -${stats.deletedLines}`,
  `Diff bytes: ${stats.diffBytes}`,
  stats.highRiskFiles.length ? `High-risk: ${stats.highRiskFiles.map((file) => path.normalize(file)).join(', ')}` : '',
  stats.generatedFiles.length ? `Generated: ${stats.generatedFiles.join(', ')}` : '',
].filter(Boolean).join('\n');
