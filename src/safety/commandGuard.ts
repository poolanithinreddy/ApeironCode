import type {RiskLevel} from './policy.js';

export interface CommandAssessment {
  allowed: boolean;
  reasons: string[];
  requiresExtraConfirmation: boolean;
  riskLevel: RiskLevel;
}

interface GuardRule {
  pattern: RegExp;
  reason: string;
}

const BLOCKED_RULES: GuardRule[] = [
  {
    pattern: /(^|\s)sudo(\s|$)/u,
    reason: 'Commands using sudo are blocked.',
  },
  {
    pattern: /curl[^|\n]*\|\s*(sh|bash|zsh)/u,
    reason: 'Piped remote shell scripts are blocked.',
  },
  {
    pattern: /wget[^|\n]*\|\s*(sh|bash|zsh)/u,
    reason: 'Piped remote shell scripts are blocked.',
  },
  {
    pattern: /\b(chmod|chown)\b[^\n]*\s\/(usr|etc|bin|sbin|System|Library|Applications)\b/u,
    reason: 'System path permission changes are blocked.',
  },
];

const HIGH_RISK_RULES: GuardRule[] = [
  {
    pattern: /\brm\s+-rf\b/u,
    reason: 'Recursive deletion is high risk.',
  },
  {
    pattern: /\bgit\s+reset\s+--hard\b/u,
    reason: 'Destructive git resets are high risk.',
  },
  {
    pattern: /\bgit\s+clean\b[^\n]*\s-f/u,
    reason: 'git clean can permanently remove files.',
  },
  {
    pattern: /\bgit\s+checkout\s+--\b/u,
    reason: 'Discarding local file changes is high risk.',
  },
  {
    pattern: /\bnpm\s+publish\b/u,
    reason: 'Publishing packages requires explicit confirmation.',
  },
];

export const assessCommand = (command: string): CommandAssessment => {
  const blocked = BLOCKED_RULES.filter((rule) => rule.pattern.test(command));
  if (blocked.length > 0) {
    return {
      allowed: false,
      reasons: blocked.map((rule) => rule.reason),
      requiresExtraConfirmation: false,
      riskLevel: 'high',
    };
  }

  const risky = HIGH_RISK_RULES.filter((rule) => rule.pattern.test(command));
  if (risky.length > 0) {
    return {
      allowed: true,
      reasons: risky.map((rule) => rule.reason),
      requiresExtraConfirmation: true,
      riskLevel: 'high',
    };
  }

  return {
    allowed: true,
    reasons: [],
    requiresExtraConfirmation: false,
    riskLevel: 'medium',
  };
};