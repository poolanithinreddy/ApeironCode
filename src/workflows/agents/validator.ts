/**
 * Validates AgentDefinition fields loaded from markdown frontmatter.
 */

import type {AgentDefinition, WorkflowValidationIssue} from '../types.js';
import type {FrontmatterValue} from '../markdown/frontmatter.js';

const KNOWN_MEMORY_VALUES = new Set(['project', 'global', 'none', 'inherit']);
const KNOWN_ISOLATION_VALUES = new Set(['none', 'sandbox']);
const KNOWN_EFFORT_VALUES = new Set(['low', 'medium', 'high']);
const KNOWN_PERMISSION_MODES = new Set([
  'default', 'plan', 'accept-edits', 'safe-auto', 'strict', 'ci', 'yolo', 'inherit',
]);

const asStringArray = (val: FrontmatterValue | undefined): string[] => {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim()) return [val.trim()];
  return [];
};

const asString = (val: FrontmatterValue | undefined): string | undefined => {
  if (typeof val === 'string') return val.trim() || undefined;
  return undefined;
};

const asNumber = (val: FrontmatterValue | undefined): number | undefined => {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const n = parseInt(val, 10);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
};

const asBoolean = (val: FrontmatterValue | undefined): boolean | undefined => {
  if (typeof val === 'boolean') return val;
  if (val === 'true') return true;
  if (val === 'false') return false;
  return undefined;
};

export interface AgentFrontmatterFields {
  name?: FrontmatterValue;
  description?: FrontmatterValue;
  model?: FrontmatterValue;
  effort?: FrontmatterValue;
  tools?: FrontmatterValue;
  disallowedTools?: FrontmatterValue;
  permissionMode?: FrontmatterValue;
  maxTurns?: FrontmatterValue;
  skills?: FrontmatterValue;
  memory?: FrontmatterValue;
  isolation?: FrontmatterValue;
  background?: FrontmatterValue;
  hooks?: FrontmatterValue;
  [key: string]: FrontmatterValue | undefined;
}

export const validateAndBuildAgent = (
  fields: AgentFrontmatterFields,
  body: string,
  filePath: string,
  source: AgentDefinition['source'],
): {definition: AgentDefinition | null; issues: WorkflowValidationIssue[]} => {
  const issues: WorkflowValidationIssue[] = [];

  const name = asString(fields.name);
  if (!name) {
    issues.push({severity: 'error', field: 'name', message: 'name is required'});
  }

  const description = asString(fields.description);
  if (!description) {
    issues.push({severity: 'error', field: 'description', message: 'description is required'});
  }

  if (issues.some((i) => i.severity === 'error')) {
    return {definition: null, issues};
  }

  const permissionModeRaw = asString(fields.permissionMode) ?? 'strict';
  const permissionMode = KNOWN_PERMISSION_MODES.has(permissionModeRaw)
    ? (permissionModeRaw as AgentDefinition['permissionMode'])
    : 'strict';
  if (!KNOWN_PERMISSION_MODES.has(permissionModeRaw)) {
    issues.push({
      severity: 'warn',
      field: 'permissionMode',
      message: `unknown permissionMode "${permissionModeRaw}", defaulting to strict`,
    });
  }

  const memoryRaw = asString(fields.memory);
  const memory = memoryRaw && KNOWN_MEMORY_VALUES.has(memoryRaw)
    ? (memoryRaw as AgentDefinition['memory'])
    : 'inherit';
  if (memoryRaw && !KNOWN_MEMORY_VALUES.has(memoryRaw)) {
    issues.push({severity: 'warn', field: 'memory', message: `unknown memory value "${memoryRaw}", defaulting to inherit`});
  }

  const isolationRaw = asString(fields.isolation);
  const isolation = isolationRaw && KNOWN_ISOLATION_VALUES.has(isolationRaw)
    ? (isolationRaw as AgentDefinition['isolation'])
    : 'none';
  if (isolationRaw && !KNOWN_ISOLATION_VALUES.has(isolationRaw)) {
    issues.push({severity: 'warn', field: 'isolation', message: `unknown isolation value "${isolationRaw}", defaulting to none`});
  }

  const effortRaw = asString(fields.effort);
  const effort = effortRaw && KNOWN_EFFORT_VALUES.has(effortRaw)
    ? (effortRaw as AgentDefinition['effort'])
    : undefined;
  if (effortRaw && !KNOWN_EFFORT_VALUES.has(effortRaw)) {
    issues.push({severity: 'warn', field: 'effort', message: `unknown effort value "${effortRaw}"`});
  }

  const tools = asStringArray(fields.tools);
  const disallowedTools = asStringArray(fields.disallowedTools);
  const skills = asStringArray(fields.skills);
  const hooks = asStringArray(fields.hooks);

  const definition: AgentDefinition = {
    kind: 'agent',
    source,
    filePath,
    name: name!,
    description: description!,
    model: asString(fields.model),
    effort,
    tools,
    disallowedTools,
    permissionMode,
    maxTurns: asNumber(fields.maxTurns),
    skills,
    memory,
    isolation,
    background: asBoolean(fields.background) ?? false,
    hooks,
    body,
  };

  return {definition, issues};
};
