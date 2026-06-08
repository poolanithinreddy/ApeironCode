import path from 'node:path';

export type PathRiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

export interface PathRisk {
  path: string;
  riskLevel: PathRiskLevel;
  reason: string;
  category: 'credential' | 'system' | 'config' | 'vcs' | 'ci' | 'lockfile' | 'safe';
}

const SYSTEM_PREFIXES = ['/etc/', '/usr/', '/bin/', '/sbin/', '/System/', '/Windows/', 'C:\\Windows\\'];

const matchesAny = (text: string, regexes: RegExp[]): boolean => regexes.some((r) => r.test(text));

const CREDENTIAL_FILE_RE = [
  /(^|\/)\.env(\.[^/]+)?$/u,
  /(^|\/)[^/]*\.env$/u,
  /(^|\/)id_rsa(\.pub)?$/u,
  /(^|\/)id_ed25519(\.pub)?$/u,
  /\.pem$/u,
  /\.key$/u,
  /(^|\/)\.aws\/credentials$/u,
  /(^|\/)\.aws\/config$/u,
  /(^|\/)gcloud\.json$/u,
  /(^|\/)application_default_credentials\.json$/u,
  /(^|\/)\.config\/gcloud\//u,
  /(^|\/)\.ssh\//u,
];

const HIGH_CRED_RE = [
  /(^|\/)\.npmrc$/u,
  /(^|\/)\.pypirc$/u,
  /(^|\/)\.netrc$/u,
];

const VCS_HIGH_RE = [
  /(^|\/)\.git\/config$/u,
  /(^|\/)\.git\/hooks\//u,
];

const CI_RE = [
  /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/u,
  /(^|\/)\.github\/[^/]+\.ya?ml$/u,
  /(^|\/)\.gitlab-ci\.ya?ml$/u,
  /(^|\/)\.circleci\/config\.ya?ml$/u,
];

const LOCKFILE_RE = [
  /(^|\/)package-lock\.json$/u,
  /(^|\/)yarn\.lock$/u,
  /(^|\/)pnpm-lock\.ya?ml$/u,
  /(^|\/)bun\.lockb$/u,
  /(^|\/)Cargo\.lock$/u,
  /(^|\/)Pipfile\.lock$/u,
];

const VCS_LOW_RE = [
  /(^|\/)\.gitignore$/u,
  /(^|\/)\.gitattributes$/u,
];

export const classifyPathRisk = (filePath: string, cwd?: string): PathRisk => {
  const normalized = cwd ? path.resolve(cwd, filePath) : path.resolve(filePath);
  const lookup = filePath.replaceAll('\\', '/');
  const norm = normalized.replaceAll('\\', '/');

  if (matchesAny(lookup, CREDENTIAL_FILE_RE) || matchesAny(norm, CREDENTIAL_FILE_RE)) {
    return {path: filePath, riskLevel: 'critical', reason: 'credential or secret file', category: 'credential'};
  }
  if (matchesAny(lookup, HIGH_CRED_RE) || matchesAny(norm, HIGH_CRED_RE)) {
    return {path: filePath, riskLevel: 'high', reason: 'package/registry credential file', category: 'credential'};
  }
  for (const prefix of SYSTEM_PREFIXES) {
    if (norm.startsWith(prefix) || filePath.startsWith(prefix)) {
      return {path: filePath, riskLevel: 'high', reason: 'system path', category: 'system'};
    }
  }
  if (matchesAny(lookup, VCS_HIGH_RE) || matchesAny(norm, VCS_HIGH_RE)) {
    return {path: filePath, riskLevel: 'high', reason: 'git config or hooks', category: 'vcs'};
  }
  if (matchesAny(lookup, CI_RE) || matchesAny(norm, CI_RE)) {
    return {path: filePath, riskLevel: 'medium', reason: 'CI workflow file', category: 'ci'};
  }
  if (matchesAny(lookup, LOCKFILE_RE) || matchesAny(norm, LOCKFILE_RE)) {
    return {path: filePath, riskLevel: 'low', reason: 'lockfile', category: 'lockfile'};
  }
  if (matchesAny(lookup, VCS_LOW_RE) || matchesAny(norm, VCS_LOW_RE)) {
    return {path: filePath, riskLevel: 'low', reason: 'vcs metadata', category: 'vcs'};
  }
  return {path: filePath, riskLevel: 'safe', reason: 'normal project path', category: 'safe'};
};

export const classifyPathsRisk = (paths: string[], cwd?: string): PathRisk[] =>
  paths.map((p) => classifyPathRisk(p, cwd));

export const formatProtectedPathWarning = (risks: PathRisk[]): string => {
  if (risks.length === 0) return 'No protected paths detected.';
  const lines: string[] = ['Protected path warning:'];
  for (const r of risks) {
    if (r.riskLevel === 'safe') continue;
    // Note: only path metadata (filename), not file contents. The path itself is the primary input;
    // file contents are not read or echoed here.
    lines.push(`- [${r.riskLevel}] ${r.category}: ${r.path} (${r.reason})`);
  }
  return lines.join('\n');
};
