export type PermissionRuleKind = 'bash' | 'deny' | 'file-edit' | 'file-read' | 'file-write';

export interface PermissionRule {
  kind: PermissionRuleKind;
  pattern: string;
  raw: string;
}

export interface PermissionRequest {
  kind: 'command' | 'deny' | 'read' | 'write';
  resource: string;
}

export type PermissionDecision = 'allow' | 'deny' | 'ask';

const ACTION_PATTERN = /^(Bash|FileRead|FileEdit|FileWrite|Deny)\((.+)\)$/u;

const globToRegExp = (pattern: string): RegExp => {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/gu, '\\$&')
    .replace(/\*\*/gu, '::DOUBLE_STAR::')
    .replace(/\*/gu, '[^/]*')
    .replace(/::DOUBLE_STAR::/gu, '.*');

  return new RegExp(`^${escaped}$`, 'u');
};

export const parsePermissionRule = (raw: string): PermissionRule | null => {
  const match = raw.trim().match(ACTION_PATTERN);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  const action = match[1];
  const pattern = match[2].trim();

  if (!pattern) {
    return null;
  }

  switch (action) {
    case 'Bash':
      return {kind: 'bash', pattern, raw};
    case 'FileRead':
      return {kind: 'file-read', pattern, raw};
    case 'FileEdit':
      return {kind: 'file-edit', pattern, raw};
    case 'FileWrite':
      return {kind: 'file-write', pattern, raw};
    case 'Deny':
      return {kind: 'deny', pattern, raw};
    default:
      return null;
  }
};

const matchesPathPattern = (pattern: string, resource: string): boolean => {
  const matcher = globToRegExp(pattern);
  return matcher.test(resource);
};

const matchesRule = (rule: PermissionRule, request: PermissionRequest): boolean => {
  switch (rule.kind) {
    case 'bash':
      return request.kind === 'command' && request.resource.includes(rule.pattern);
    case 'file-read':
      return request.kind === 'read' && matchesPathPattern(rule.pattern, request.resource);
    case 'file-edit':
      return request.kind === 'write' && matchesPathPattern(rule.pattern, request.resource);
    case 'file-write':
      return request.kind === 'write' && matchesPathPattern(rule.pattern, request.resource);
    case 'deny':
      return matchesPathPattern(rule.pattern, request.resource) || request.resource.includes(rule.pattern);
    default:
      return false;
  }
};

export const evaluatePermissionRules = (
  rawRules: string[],
  request: PermissionRequest,
): PermissionDecision => {
  const rules = rawRules
    .map(parsePermissionRule)
    .filter((rule): rule is PermissionRule => rule !== null);

  if (rules.some((rule) => rule.kind === 'deny' && matchesRule(rule, request))) {
    return 'deny';
  }

  if (rules.some((rule) => matchesRule(rule, request))) {
    return 'allow';
  }

  return 'ask';
};