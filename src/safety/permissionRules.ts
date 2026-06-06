export type RuleAction = 'allow' | 'deny' | 'ask';

export type RuleMatcher = {
  type: 'tool' | 'command' | 'path-glob' | 'risk-category' | 'domain';
  value: string;
};

export interface PermissionRule {
  id: string;
  action: RuleAction;
  matchers: RuleMatcher[];
  description?: string;
  dangerous?: boolean;
}

export interface RuleEvalResult {
  decision: RuleAction;
  matchedRule?: PermissionRule;
  warnings: string[];
}

export interface ActionDescriptor {
  toolName?: string;
  command?: string;
  path?: string;
  riskCategory?: string;
  domain?: string;
}

const RULE_RE = /^(allow|deny|ask):(tool|command|path|risk|domain)\(([^)]*)\)$/u;

export const parsePermissionRule = (input: string): PermissionRule => {
  const trimmed = input.trim();
  const match = trimmed.match(RULE_RE);
  if (!match) {
    throw new Error(`Invalid permission rule format: ${input}`);
  }
  const action = match[1] as RuleAction;
  const typeShort = match[2] ?? '';
  const value = (match[3] ?? '').trim();
  const typeMap: Record<string, RuleMatcher['type']> = {
    tool: 'tool',
    command: 'command',
    path: 'path-glob',
    risk: 'risk-category',
    domain: 'domain',
  };
  const type = typeMap[typeShort];
  if (!type) throw new Error(`Unknown matcher type: ${typeShort}`);

  const rule: PermissionRule = {
    id: trimmed,
    action,
    matchers: [{type, value}],
    description: trimmed,
  };
  rule.dangerous = isDangerouslyBroadRule(rule);
  return rule;
};

const globToRegExp = (pattern: string): RegExp => {
  if (pattern === '*') return /.*/u;
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/gu, '\\$&')
    .replace(/\*\*/gu, '::DOUBLE_STAR::')
    .replace(/\*/gu, '[^/]*')
    .replace(/::DOUBLE_STAR::/gu, '.*');
  return new RegExp(`^${escaped}$`, 'u');
};

const matcherMatches = (matcher: RuleMatcher, action: ActionDescriptor): boolean => {
  switch (matcher.type) {
    case 'tool':
      if (!action.toolName) return false;
      return matcher.value === '*' || matcher.value === action.toolName;
    case 'command':
      if (!action.command) return false;
      if (matcher.value === '*') return true;
      // command matchers use prefix matching on base command, OR substring with ":*"
      if (matcher.value.endsWith(':*')) {
        const head = matcher.value.slice(0, -2);
        return action.command.startsWith(head);
      }
      return action.command.includes(matcher.value);
    case 'path-glob':
      if (!action.path) return false;
      return globToRegExp(matcher.value).test(action.path);
    case 'risk-category':
      if (!action.riskCategory) return false;
      return matcher.value === '*' || matcher.value === action.riskCategory;
    case 'domain':
      if (!action.domain) return false;
      return matcher.value === '*' || action.domain === matcher.value || action.domain.endsWith(`.${matcher.value}`);
    default:
      return false;
  }
};

const ruleMatches = (rule: PermissionRule, action: ActionDescriptor): boolean =>
  rule.matchers.every((m) => matcherMatches(m, action));

export const isDangerouslyBroadRule = (rule: PermissionRule): boolean => {
  if (rule.action === 'allow') {
    for (const m of rule.matchers) {
      if (m.value === '*') return true;
      if (m.type === 'command' && /^sudo:?\*?$/u.test(m.value)) return true;
      if (m.type === 'risk-category' && m.value === '*') return true;
    }
  }
  if (rule.action === 'deny') {
    if (rule.matchers.length === 1 && rule.matchers[0]?.value === '*') return true;
  }
  return false;
};

export const evaluatePermissionRules = (action: ActionDescriptor, rules: PermissionRule[]): RuleEvalResult => {
  const warnings: string[] = [];
  let denyMatch: PermissionRule | undefined;
  let askMatch: PermissionRule | undefined;
  let allowMatch: PermissionRule | undefined;

  for (const rule of rules) {
    if (!ruleMatches(rule, action)) continue;
    if (rule.dangerous) warnings.push(`dangerously broad rule matched: ${rule.id}`);
    if (rule.action === 'deny' && !denyMatch) denyMatch = rule;
    else if (rule.action === 'ask' && !askMatch) askMatch = rule;
    else if (rule.action === 'allow' && !allowMatch) allowMatch = rule;
  }

  if (denyMatch) return {decision: 'deny', matchedRule: denyMatch, warnings};
  if (askMatch) return {decision: 'ask', matchedRule: askMatch, warnings};
  if (allowMatch) return {decision: 'allow', matchedRule: allowMatch, warnings};
  return {decision: 'ask', warnings};
};

export const formatPermissionDecision = (result: RuleEvalResult): string => {
  const parts = [`decision: ${result.decision}`];
  if (result.matchedRule) parts.push(`matched: ${result.matchedRule.id}`);
  if (result.warnings.length > 0) parts.push(`warnings: ${result.warnings.join('; ')}`);
  // Defensive redact
  return parts.join(' | ').replace(/[A-Za-z0-9_-]{40,}/gu, '[redacted]');
};
