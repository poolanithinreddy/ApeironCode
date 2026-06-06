/**
 * Loads skill definitions from `.apeironcode/skills/<name>/SKILL.md`.
 * Progressive disclosure: only metadata is loaded initially.
 * Full body is included only when explicitly selected.
 * References are listed but not injected. Scripts are never executed.
 */

import fs from 'node:fs';
import path from 'node:path';

import {parseMarkdownFrontmatter} from '../markdown/frontmatter.js';
import {getProjectTrustStatus} from '../../safety/projectTrust.js';
import type {SkillDefinition, WorkflowLoadResult, WorkflowValidationIssue} from '../types.js';
import type {FrontmatterValue} from '../markdown/frontmatter.js';

const SKILLS_DIR = '.apeironcode/skills';
const SKILL_FILE = 'SKILL.md';

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

const asBoolean = (val: FrontmatterValue | undefined): boolean => {
  if (typeof val === 'boolean') return val;
  if (val === 'true') return true;
  if (val === 'false') return false;
  return false;
};

export interface LoadSkillOptions {
  skipTrustCheck?: boolean;
  /** Include full body (progressive disclosure). Default: false = metadata only. */
  includeBody?: boolean;
}

const validateAndBuildSkill = (
  fields: Record<string, FrontmatterValue>,
  body: string,
  filePath: string,
  source: SkillDefinition['source'],
  includeBody: boolean,
): {definition: SkillDefinition | null; issues: WorkflowValidationIssue[]} => {
  const issues: WorkflowValidationIssue[] = [];

  const name = asString(fields['name']);
  if (!name) issues.push({severity: 'error', field: 'name', message: 'name is required'});

  const description = asString(fields['description']);
  if (!description) issues.push({severity: 'error', field: 'description', message: 'description is required'});

  if (issues.some((i) => i.severity === 'error')) return {definition: null, issues};

  const definition: SkillDefinition = {
    kind: 'skill',
    source,
    filePath,
    name: name!,
    description: description!,
    whenToUse: asString(fields['whenToUse']) ?? '',
    allowedTools: asStringArray(fields['allowedTools']),
    disallowedTools: asStringArray(fields['disallowedTools']),
    references: asStringArray(fields['references']),
    scripts: asStringArray(fields['scripts']),
    tokenBudget: asNumber(fields['tokenBudget']),
    progressiveDisclosure: asBoolean(fields['progressiveDisclosure']),
    // Progressive disclosure: body only when requested
    body: includeBody ? body : '',
  };

  return {definition, issues};
};

export const loadSkillDefinition = (
  skillDir: string,
  source: SkillDefinition['source'],
  options: LoadSkillOptions = {},
): WorkflowLoadResult<SkillDefinition> => {
  const filePath = path.join(skillDir, SKILL_FILE);
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return {
      definition: null,
      issues: [{severity: 'error', message: `cannot read SKILL.md in ${path.basename(skillDir)}`}],
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

  const {definition, issues} = validateAndBuildSkill(
    parsed.data,
    parsed.body,
    filePath,
    source,
    options.includeBody ?? false,
  );

  return {
    definition,
    issues,
    trustStatus: definition ? 'allowed' : 'blocked',
    source,
    filePath,
  };
};

const listSkillDirs = (baseDir: string): string[] => {
  try {
    return fs.readdirSync(baseDir)
      .map((entry) => path.join(baseDir, entry))
      .filter((dir) => {
        try {
          return fs.statSync(dir).isDirectory();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
};

export const loadSkillDefinitions = (
  cwd: string,
  options: LoadSkillOptions = {},
): WorkflowLoadResult<SkillDefinition>[] => {
  const skillsBaseDir = path.join(cwd, SKILLS_DIR);
  const skillDirs = listSkillDirs(skillsBaseDir);
  if (skillDirs.length === 0) return [];

  const trustStatus = options.skipTrustCheck
    ? 'trusted'
    : getProjectTrustStatus(cwd).trust;

  if (trustStatus !== 'trusted') {
    return skillDirs.map((skillDir) => ({
      definition: null,
      issues: [{
        severity: 'warn' as const,
        message: `project skill blocked: project is not trusted (trust=${trustStatus}). Run "apeironcode trust" to enable.`,
      }] as WorkflowValidationIssue[],
      trustStatus: 'blocked' as const,
      source: 'project' as const,
      filePath: path.join(skillDir, SKILL_FILE),
    }));
  }

  return skillDirs.map((dir) => loadSkillDefinition(dir, 'project', options));
};
