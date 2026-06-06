/**
 * Loads command definitions from `.apeironcode/commands/*.md`.
 * Commands render a prompt (no arbitrary shell execution).
 * Project commands with requiresTrust: true are blocked for untrusted projects.
 */

import fs from 'node:fs';
import path from 'node:path';

import {parseMarkdownFrontmatter} from '../markdown/frontmatter.js';
import {getProjectTrustStatus} from '../../safety/projectTrust.js';
import type {CommandDefinition, WorkflowLoadResult, WorkflowValidationIssue} from '../types.js';
import type {FrontmatterValue} from '../markdown/frontmatter.js';

const COMMANDS_DIR = '.apeironcode/commands';

const asStringArray = (val: FrontmatterValue | undefined): string[] => {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim()) return [val.trim()];
  return [];
};

const asString = (val: FrontmatterValue | undefined): string | undefined => {
  if (typeof val === 'string') return val.trim() || undefined;
  return undefined;
};

const asBoolean = (val: FrontmatterValue | undefined): boolean => {
  if (typeof val === 'boolean') return val;
  if (val === 'true') return true;
  if (val === 'false') return false;
  return false;
};

const KNOWN_PERMISSION_MODES = new Set([
  'default', 'plan', 'accept-edits', 'safe-auto', 'strict', 'ci', 'yolo', 'inherit',
]);

const validateAndBuildCommand = (
  fields: Record<string, FrontmatterValue>,
  body: string,
  filePath: string,
  source: CommandDefinition['source'],
): {definition: CommandDefinition | null; issues: WorkflowValidationIssue[]} => {
  const issues: WorkflowValidationIssue[] = [];

  const name = asString(fields['name']);
  if (!name) issues.push({severity: 'error', field: 'name', message: 'name is required'});

  const description = asString(fields['description']);
  if (!description) issues.push({severity: 'error', field: 'description', message: 'description is required'});

  if (issues.some((i) => i.severity === 'error')) return {definition: null, issues};

  const permissionModeRaw = asString(fields['permissionMode']) ?? 'inherit';
  const permissionMode = KNOWN_PERMISSION_MODES.has(permissionModeRaw)
    ? (permissionModeRaw as CommandDefinition['permissionMode'])
    : 'inherit';
  if (!KNOWN_PERMISSION_MODES.has(permissionModeRaw)) {
    issues.push({
      severity: 'warn',
      field: 'permissionMode',
      message: `unknown permissionMode "${permissionModeRaw}", defaulting to inherit`,
    });
  }

  const definition: CommandDefinition = {
    kind: 'command',
    source,
    filePath,
    name: name!,
    description: description!,
    aliases: asStringArray(fields['aliases']),
    argumentHint: asString(fields['argumentHint']),
    body,
    allowedTools: asStringArray(fields['allowedTools']),
    permissionMode,
    requiresTrust: asBoolean(fields['requiresTrust']),
  };

  return {definition, issues};
};

export const validateCommandDefinition = (definition: CommandDefinition): WorkflowValidationIssue[] => {
  const issues: WorkflowValidationIssue[] = [];
  if (!definition.name) issues.push({severity: 'error', field: 'name', message: 'name is required'});
  if (!definition.description) issues.push({severity: 'error', field: 'description', message: 'description is required'});
  return issues;
};

export interface LoadCommandOptions {
  skipTrustCheck?: boolean;
}

export const loadCommandDefinition = (
  filePath: string,
  source: CommandDefinition['source'],
): WorkflowLoadResult<CommandDefinition> => {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return {
      definition: null,
      issues: [{severity: 'error', message: `cannot read file: ${path.basename(filePath)}`}],
      trustStatus: 'blocked',
      source,
      filePath,
    };
  }

  const parsed = parseMarkdownFrontmatter(raw);
  if (!parsed.ok) {
    return {
      definition: null,
      issues: [{severity: 'error', message: parsed.error}],
      trustStatus: 'blocked',
      source,
      filePath,
    };
  }

  const {definition, issues} = validateAndBuildCommand(parsed.data, parsed.body, filePath, source);
  return {
    definition,
    issues,
    trustStatus: definition ? 'allowed' : 'blocked',
    source,
    filePath,
  };
};

export const loadCommandDefinitions = (
  cwd: string,
  options: LoadCommandOptions = {},
): WorkflowLoadResult<CommandDefinition>[] => {
  const commandsDir = path.join(cwd, COMMANDS_DIR);
  let files: string[];
  try {
    files = fs.readdirSync(commandsDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => path.join(commandsDir, f));
  } catch {
    return [];
  }
  if (files.length === 0) return [];

  const trustLevel = options.skipTrustCheck
    ? 'trusted'
    : getProjectTrustStatus(cwd).trust;

  return files.map((filePath) => {
    const result = loadCommandDefinition(filePath, 'project');
    if (!result.definition) return result;

    if (result.definition.requiresTrust && trustLevel !== 'trusted') {
      return {
        ...result,
        definition: null,
        trustStatus: 'blocked' as const,
        issues: [{
          severity: 'warn' as const,
          message: `command "${result.definition.name}" requires trust but project is not trusted (trust=${trustLevel}).`,
        }],
      };
    }

    return result;
  });
};
