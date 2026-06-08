import type {ParsedShellCommand} from './types.js';

export type CommandRiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

export interface CommandSemantics {
  riskLevel: CommandRiskLevel;
  isReadOnly: boolean;
  isDestructive: boolean;
  isNetworkCommand: boolean;
  isFilesystemWrite: boolean;
  isPackageMutation: boolean;
  isCredentialRisk: boolean;
  isRemoteScriptExecution: boolean;
  exitCode1IsBenign: boolean;
  riskReasons: string[];
}

const READ_ONLY_COMMANDS = new Set([
  'ls', 'cat', 'head', 'tail', 'less', 'more', 'echo', 'pwd', 'whoami', 'date',
  'grep', 'rg', 'find', 'wc', 'stat', 'file', 'which', 'whereis', 'type', 'env',
  'printenv', 'diff', 'cmp', 'sort', 'uniq', 'awk', 'sed', 'cut', 'tr', 'tee',
  'true', 'false', 'test', '[', 'basename', 'dirname', 'realpath', 'readlink',
  'tree', 'du', 'df',
]);

const FILESYSTEM_WRITE_COMMANDS = new Set([
  'cp', 'mv', 'mkdir', 'touch', 'ln', 'chmod', 'chown', 'tar', 'zip', 'unzip',
  'gzip', 'gunzip', 'rsync',
]);

const DESTRUCTIVE_COMMANDS = new Set([
  'rm', 'rmdir', 'dd', 'mkfs', 'fdisk', 'format', 'shred', 'truncate',
  'kill', 'pkill', 'killall', 'shutdown', 'reboot',
]);

const NETWORK_COMMANDS = new Set([
  'curl', 'wget', 'fetch', 'ssh', 'scp', 'rsync', 'nc', 'ncat', 'netcat', 'ftp', 'sftp',
]);

const PACKAGE_MANAGERS = new Set([
  'npm', 'pnpm', 'yarn', 'bun', 'pip', 'pip3', 'gem', 'cargo', 'go',
]);

const EXIT1_BENIGN = new Set(['grep', 'rg', 'diff', 'cmp', 'test', '[']);

const RISK_ORDER: CommandRiskLevel[] = ['safe', 'low', 'medium', 'high', 'critical'];
const isLowerThan = (a: CommandRiskLevel, b: CommandRiskLevel): boolean =>
  RISK_ORDER.indexOf(a) < RISK_ORDER.indexOf(b);

const CREDENTIAL_PATH_PATTERNS = [
  /\.env(\.|$)/u, /\bid_rsa\b/u, /\bid_ed25519\b/u, /\.pem$/u, /\.key$/u,
  /~\/\.ssh\//u, /~\/\.aws\//u, /~\/\.gcloud\//u, /~\/\.config\/gcloud/u,
  /\baws\/credentials\b/u, /\bnetrc\b/u, /\bnpmrc\b/u, /\bpypirc\b/u,
];

const containsCredentialPath = (text: string): boolean => {
  return CREDENTIAL_PATH_PATTERNS.some((p) => p.test(text));
};

const segmentTouchesCredential = (cmd: ParsedShellCommand): boolean => {
  const all = [cmd.baseCommand, ...cmd.args, ...Object.keys(cmd.envAssignments), ...Object.values(cmd.envAssignments)].join(' ');
  if (containsCredentialPath(all)) return true;
  if (cmd.subshells.some(containsCredentialPath)) return true;
  for (const r of cmd.redirects) {
    if (containsCredentialPath(r.target)) return true;
  }
  return false;
};

const collectChain = (cmd: ParsedShellCommand): ParsedShellCommand[] => {
  const out: ParsedShellCommand[] = [cmd];
  for (const c of cmd.chains) out.push(c.command);
  return out;
};

export const isReadOnlyCommand = (cmd: ParsedShellCommand): boolean => {
  const all = collectChain(cmd);
  return all.every((c) => {
    if (!c.baseCommand) return true;
    if (!READ_ONLY_COMMANDS.has(c.baseCommand.toLowerCase())) return false;
    // redirects to write file are not read-only
    if (c.redirects.some((r) => r.kind === '>' || r.kind === '>>' || r.kind === '2>')) return false;
    return true;
  });
};

export const isDestructiveCommand = (cmd: ParsedShellCommand): boolean => {
  return collectChain(cmd).some((c) => DESTRUCTIVE_COMMANDS.has(c.baseCommand.toLowerCase()) || c.hasDestructive);
};

export const isNetworkCommand = (cmd: ParsedShellCommand): boolean => {
  return collectChain(cmd).some((c) => NETWORK_COMMANDS.has(c.baseCommand.toLowerCase()) || c.hasNetworkCommand);
};

export const isFilesystemWriteCommand = (cmd: ParsedShellCommand): boolean => {
  const all = collectChain(cmd);
  return all.some((c) => {
    if (FILESYSTEM_WRITE_COMMANDS.has(c.baseCommand.toLowerCase())) return true;
    if (c.redirects.some((r) => r.kind === '>' || r.kind === '>>' || r.kind === '2>')) return true;
    return false;
  });
};

export const isPackageMutationCommand = (cmd: ParsedShellCommand): boolean => {
  const all = collectChain(cmd);
  for (const c of all) {
    const base = c.baseCommand.toLowerCase();
    if (!PACKAGE_MANAGERS.has(base)) continue;
    const args = c.args.map((a) => a.toLowerCase());
    if (args.includes('install') || args.includes('i') || args.includes('add')
      || args.includes('publish') || args.includes('uninstall') || args.includes('remove')
      || args.includes('update') || args.includes('upgrade')) {
      return true;
    }
  }
  return false;
};

export const isCredentialExposureRisk = (cmd: ParsedShellCommand): boolean => {
  return collectChain(cmd).some(segmentTouchesCredential);
};

const detectRemoteScriptExecution = (cmd: ParsedShellCommand): boolean => {
  // curl ... | sh / bash / zsh
  const chain = collectChain(cmd);
  for (let i = 0; i < chain.length - 1; i += 1) {
    const left = chain[i];
    const right = chain[i + 1];
    if (!left || !right) continue;
    const leftIsNet = NETWORK_COMMANDS.has(left.baseCommand.toLowerCase());
    const rightBase = right.baseCommand.toLowerCase();
    const rightIsShell = ['sh', 'bash', 'zsh', 'ksh', 'fish'].includes(rightBase);
    // operator linking left -> right is the operator on chain entry i+1 if root ... we used flat list
    // We need the operator. The first element is root, so chains[i] holds operator between root and chains[i].command.
    if (i === 0) {
      const op = cmd.chains[0]?.operator;
      if (op === '|' && leftIsNet && rightIsShell) return true;
    } else {
      const op = cmd.chains[i]?.operator;
      if (op === '|' && leftIsNet && rightIsShell) return true;
    }
  }
  // bash <(curl ...) or sh <(curl ...) — appears as base bash + subshell containing curl
  if (['bash', 'sh', 'zsh'].includes(cmd.baseCommand.toLowerCase())) {
    if (cmd.subshells.some((s) => /\b(curl|wget|fetch)\b/u.test(s))) return true;
  }
  for (const c of chain) {
    if (['bash', 'sh', 'zsh'].includes(c.baseCommand.toLowerCase())) {
      if (c.subshells.some((s) => /\b(curl|wget|fetch)\b/u.test(s))) return true;
    }
  }
  return false;
};

export const classifyCommandSemantics = (cmd: ParsedShellCommand): CommandSemantics => {
  const reasons: string[] = [];
  const readOnly = isReadOnlyCommand(cmd);
  const destructive = isDestructiveCommand(cmd);
  const network = isNetworkCommand(cmd);
  const fsWrite = isFilesystemWriteCommand(cmd);
  const pkgMutation = isPackageMutationCommand(cmd);
  const credRisk = isCredentialExposureRisk(cmd);
  const remoteScript = detectRemoteScriptExecution(cmd);

  let level: CommandRiskLevel = 'safe';

  // sudo elevates risk
  const usesSudo = collectChain(cmd).some((c) => c.baseCommand.toLowerCase() === 'sudo');
  if (usesSudo) {
    level = 'high';
    reasons.push('uses sudo');
  }

  // rm -rf is critical
  if (collectChain(cmd).some((c) => c.baseCommand.toLowerCase() === 'rm' && c.args.some((a) => a.includes('rf') || a.includes('-r')))) {
    level = 'critical';
    reasons.push('rm with recursive flag');
  } else if (destructive) {
    if (isLowerThan(level, 'high')) level = 'high';
    reasons.push('destructive command');
  }

  if (remoteScript) {
    level = 'critical';
    reasons.push('remote script execution (curl|sh)');
  }

  // Global package install
  const globalInstall = collectChain(cmd).some((c) => {
    const base = c.baseCommand.toLowerCase();
    if (!PACKAGE_MANAGERS.has(base)) return false;
    const args = c.args.map((a) => a.toLowerCase());
    return (args.includes('install') || args.includes('i') || args.includes('add'))
      && (args.includes('-g') || args.includes('--global'));
  });
  if (globalInstall) {
    if (level !== 'critical') level = 'high';
    reasons.push('global package install');
  } else if (pkgMutation) {
    if (isLowerThan(level, 'medium')) level = 'medium';
    reasons.push('package mutation');
  }

  if (credRisk) {
    if (isLowerThan(level, 'high')) level = 'high';
    reasons.push('credential file exposure');
  }
  // printenv/env piped to a network command exposes process env (which often holds secrets)
  const envExposure = collectChain(cmd).some((c) => ['printenv', 'env'].includes(c.baseCommand.toLowerCase()))
    && network;
  if (envExposure) {
    level = 'high';
    reasons.push('environment exposure to network');
  }
  if (network) {
    if (level === 'safe') level = 'medium';
    reasons.push('network access');
  }
  if (fsWrite) {
    if (level === 'safe') level = 'low';
    reasons.push('filesystem write');
  }

  if (level === 'safe' && !readOnly) {
    level = 'low';
  }

  const exitCode1IsBenign = EXIT1_BENIGN.has(cmd.baseCommand.toLowerCase());

  return {
    riskLevel: level,
    isReadOnly: readOnly,
    isDestructive: destructive,
    isNetworkCommand: network,
    isFilesystemWrite: fsWrite,
    isPackageMutation: pkgMutation,
    isCredentialRisk: credRisk,
    isRemoteScriptExecution: remoteScript,
    exitCode1IsBenign,
    riskReasons: reasons,
  };
};

export const formatCommandRiskSummary = (semantics: CommandSemantics): string => {
  const flags: string[] = [];
  if (semantics.isReadOnly) flags.push('read-only');
  if (semantics.isDestructive) flags.push('destructive');
  if (semantics.isNetworkCommand) flags.push('network');
  if (semantics.isFilesystemWrite) flags.push('fs-write');
  if (semantics.isPackageMutation) flags.push('package-mutation');
  if (semantics.isCredentialRisk) flags.push('credential-risk');
  if (semantics.isRemoteScriptExecution) flags.push('remote-script');
  return `[${semantics.riskLevel}] ${flags.join(', ') || 'no flags'}${semantics.riskReasons.length > 0 ? ` — ${semantics.riskReasons.join('; ')}` : ''}`;
};
