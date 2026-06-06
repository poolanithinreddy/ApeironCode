import type {PermissionRule} from './permissionParser.js';

export interface PermissionRequest {
  actionType: 'FileRead' | 'FileEdit' | 'FileWrite' | 'Bash' | 'Tool' | 'Network';
  resource: string;
}

export type PermissionDecision = 'allow' | 'deny' | 'ask';

const globToRegExp = (pattern: string): RegExp => {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/gu, '\\$&')
    .replace(/\*\*/gu, '::DOUBLE_STAR::')
    .replace(/\*/gu, '[^/]*')
    .replace(/::DOUBLE_STAR::/gu, '.*');

  return new RegExp(`^${escaped}$`, 'u');
};

const bashGlobToRegExp = (pattern: string): RegExp => {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/gu, '\\$&')
    .replace(/\*\*/gu, '::DOUBLE_STAR::')
    .replace(/\*/gu, '.*')
    .replace(/::DOUBLE_STAR::/gu, '.*');

  return new RegExp(`^${escaped}$`, 'u');
};

const matchesGlob = (pattern: string, resource: string): boolean => {
  const regex = globToRegExp(pattern);
  return regex.test(resource);
};

const matchesToolPattern = (pattern: string, toolId: string): boolean => {
  // Support plugin:name.* and mcp:server.*
  if (pattern.includes('*')) {
    return matchesGlob(pattern, toolId);
  }
  // Exact match
  return pattern === toolId;
};

const matchesCommandPattern = (pattern: string, command: string): boolean => {
  // For bash commands with wildcards, use bash glob matching (where * matches anything including /)
  if (pattern.includes('*')) {
    const regex = bashGlobToRegExp(pattern);
    return regex.test(command);
  }
  // For exact commands, require full match
  if (pattern.includes(' ')) {
    return command.trim() === pattern.trim();
  }
  // For command names, support prefix matching
  return command.split(/\s+/)[0] === pattern || command.startsWith(`${pattern} `);
};

const matchesRule = (rule: PermissionRule, request: PermissionRequest): boolean => {
  if (rule.actionType !== request.actionType) {
    return false;
  }

  switch (rule.actionType) {
    case 'FileRead':
    case 'FileEdit':
    case 'FileWrite':
      return matchesGlob(rule.pattern, request.resource);
    case 'Bash':
      return matchesCommandPattern(rule.pattern, request.resource);
    case 'Tool':
      return matchesToolPattern(rule.pattern, request.resource);
    case 'Network':
      return matchesGlob(rule.pattern, request.resource);
    default:
      return false;
  }
};

export const evaluatePermissionRules = (
  rules: PermissionRule[],
  request: PermissionRequest,
): {decision: PermissionDecision; matchedRule: PermissionRule | null} => {
  // Deny rules always take precedence
  const denyMatch = rules.find(
    (rule) => rule.effect === 'Deny' && matchesRule(rule, request),
  );

  if (denyMatch) {
    return {decision: 'deny', matchedRule: denyMatch};
  }

  // Check for allow rules
  const allowMatch = rules.find(
    (rule) => rule.effect === 'Allow' && matchesRule(rule, request),
  );

  if (allowMatch) {
    return {decision: 'allow', matchedRule: allowMatch};
  }

  // No match = ask
  return {decision: 'ask', matchedRule: null};
};
