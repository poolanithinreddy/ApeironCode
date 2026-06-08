export interface SecurityLimit {
  detail: string;
  label: string;
  status: 'enabled' | 'not-enabled';
}

export const getSecurityLimits = (): SecurityLimit[] => [
  {
    detail: 'ApeironCode relies on approvals and workspace isolation modes, not OS process sandboxing.',
    label: 'OS sandboxing',
    status: 'not-enabled',
  },
  {
    detail: 'Subagents share the current process environment and configured provider/connector credentials.',
    label: 'Per-subagent credential isolation',
    status: 'not-enabled',
  },
  {
    detail: 'Execution is local to this machine and workspace.',
    label: 'Cloud/distributed execution',
    status: 'not-enabled',
  },
  {
    detail: 'Read-only lane scheduling exists; editing lanes remain sequential.',
    label: 'Parallel editing',
    status: 'not-enabled',
  },
  {
    detail: 'Rename detection is heuristic/hash/text based, not semantic refactor analysis.',
    label: 'Semantic rename engine',
    status: 'not-enabled',
  },
];

export const formatSecurityLimits = (): string => [
  'Security limits',
  ...getSecurityLimits().map((limit) => `- ${limit.label}: ${limit.status} — ${limit.detail}`),
].join('\n');
