export type PermissionEffect = 'Allow' | 'Deny';
export type ActionType = 'FileRead' | 'FileEdit' | 'FileWrite' | 'Bash' | 'Tool' | 'Network';

export interface PermissionRule {
  effect: PermissionEffect;
  actionType: ActionType;
  pattern: string;
  raw: string;
}

const RULE_PATTERN = /^(Allow|Deny)\((\w+)\((.+)\)\)$/u;

export class PermissionParseError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(message);
    this.name = 'PermissionParseError';
  }
}

export const parsePermissionRule = (raw: string): PermissionRule => {
  const trimmed = raw.trim();
  const match = trimmed.match(RULE_PATTERN);

  if (!match || !match[1] || !match[2] || !match[3]) {
    throw new PermissionParseError(
      `Invalid permission rule format. Expected: Allow|Deny(ActionType(pattern)). Got: ${trimmed}`,
      raw,
    );
  }

  const effect = match[1] as PermissionEffect;
  const actionTypeStr = match[2];
  const pattern = match[3].trim();

  if (!pattern) {
    throw new PermissionParseError(
      `Permission rule pattern cannot be empty: ${trimmed}`,
      raw,
    );
  }

  const validActionTypes: ActionType[] = ['FileRead', 'FileEdit', 'FileWrite', 'Bash', 'Tool', 'Network'];
  if (!validActionTypes.includes(actionTypeStr as ActionType)) {
    throw new PermissionParseError(
      `Unknown action type: ${actionTypeStr}. Valid types: ${validActionTypes.join(', ')}`,
      raw,
    );
  }

  return {
    effect,
    actionType: actionTypeStr as ActionType,
    pattern,
    raw: trimmed,
  };
};

export const parsePermissionRules = (raws: string[]): {valid: PermissionRule[]; errors: PermissionParseError[]} => {
  const valid: PermissionRule[] = [];
  const errors: PermissionParseError[] = [];

  for (const raw of raws) {
    try {
      valid.push(parsePermissionRule(raw));
    } catch (err) {
      if (err instanceof PermissionParseError) {
        errors.push(err);
      }
    }
  }

  return {valid, errors};
};
