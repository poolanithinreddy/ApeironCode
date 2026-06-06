import type {CommandRiskLevel} from './shell/commandSemantics.js';

export type PermissionMode = 'default' | 'plan' | 'accept-edits' | 'safe-auto' | 'strict' | 'ci' | 'yolo';

export type ActionCategory =
  | 'read-file' | 'write-file' | 'edit-file' | 'delete-file'
  | 'run-shell' | 'run-network' | 'run-package-install' | 'run-destructive'
  | 'edit-protected-path' | 'connector-write' | 'mcp-write' | 'github-write';

export type PermissionDecision = 'allow' | 'ask' | 'deny';

interface ModeMatrixEntry {
  default: PermissionDecision;
  plan: PermissionDecision;
  'accept-edits': PermissionDecision;
  'safe-auto': PermissionDecision;
  strict: PermissionDecision;
  ci: PermissionDecision;
  yolo: PermissionDecision;
}

const MATRIX: Record<ActionCategory, ModeMatrixEntry> = {
  'read-file': {default: 'allow', plan: 'allow', 'accept-edits': 'allow', 'safe-auto': 'allow', strict: 'allow', ci: 'allow', yolo: 'allow'},
  'write-file': {default: 'ask', plan: 'deny', 'accept-edits': 'allow', 'safe-auto': 'ask', strict: 'ask', ci: 'deny', yolo: 'allow'},
  'edit-file': {default: 'ask', plan: 'deny', 'accept-edits': 'allow', 'safe-auto': 'ask', strict: 'ask', ci: 'deny', yolo: 'allow'},
  'delete-file': {default: 'ask', plan: 'deny', 'accept-edits': 'ask', 'safe-auto': 'ask', strict: 'ask', ci: 'deny', yolo: 'allow'},
  'run-shell': {default: 'ask', plan: 'deny', 'accept-edits': 'ask', 'safe-auto': 'allow', strict: 'ask', ci: 'deny', yolo: 'allow'},
  'run-network': {default: 'ask', plan: 'deny', 'accept-edits': 'ask', 'safe-auto': 'ask', strict: 'ask', ci: 'deny', yolo: 'allow'},
  'run-package-install': {default: 'ask', plan: 'deny', 'accept-edits': 'ask', 'safe-auto': 'ask', strict: 'ask', ci: 'deny', yolo: 'allow'},
  'run-destructive': {default: 'ask', plan: 'deny', 'accept-edits': 'ask', 'safe-auto': 'deny', strict: 'deny', ci: 'deny', yolo: 'ask'},
  'edit-protected-path': {default: 'ask', plan: 'deny', 'accept-edits': 'ask', 'safe-auto': 'deny', strict: 'deny', ci: 'deny', yolo: 'ask'},
  'connector-write': {default: 'ask', plan: 'deny', 'accept-edits': 'ask', 'safe-auto': 'ask', strict: 'ask', ci: 'deny', yolo: 'allow'},
  'mcp-write': {default: 'ask', plan: 'deny', 'accept-edits': 'ask', 'safe-auto': 'ask', strict: 'ask', ci: 'deny', yolo: 'allow'},
  'github-write': {default: 'ask', plan: 'deny', 'accept-edits': 'ask', 'safe-auto': 'ask', strict: 'ask', ci: 'deny', yolo: 'allow'},
};

const RISKY_LEVELS: CommandRiskLevel[] = ['high', 'critical'];

export const getPermissionDecision = (
  mode: PermissionMode,
  action: ActionCategory,
  riskLevel?: CommandRiskLevel,
): PermissionDecision => {
  const entry = MATRIX[action];
  let decision = entry[mode];

  // For run-shell, downgrade safe-auto when command is risky.
  if (action === 'run-shell' && riskLevel && RISKY_LEVELS.includes(riskLevel)) {
    if (mode === 'safe-auto') decision = 'ask';
    if (mode === 'yolo' && riskLevel === 'critical') decision = 'ask';
  }
  return decision;
};

export const describePermissionMode = (mode: PermissionMode): string => {
  switch (mode) {
    case 'default':
      return 'Ask for confirmation on writes, shell, and network actions';
    case 'plan':
      return 'Plan-only: no writes, no shell. Read and analyze only.';
    case 'accept-edits':
      return 'Auto-accept file edits; still ask for shell/network';
    case 'safe-auto':
      return 'Auto-run safe read-only shell; ask for risky actions';
    case 'strict':
      return 'Strictest interactive mode; ask on all writes/shell, deny destructive';
    case 'ci':
      return 'CI/non-interactive: deny writes and shell unless explicitly allow-listed';
    case 'yolo':
      return 'Allow most actions; still ask for destructive and protected paths';
    default:
      return 'unknown permission mode';
  }
};

export const isNonInteractiveMode = (mode: PermissionMode): boolean => {
  return mode === 'ci' || mode === 'plan';
};
