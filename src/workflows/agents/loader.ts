/**
 * Loads agent definitions from `.apeironcode/agents/*.md` files.
 * Project agents require a trusted project to auto-load.
 * Untrusted project agents are listed as blocked/pending trust.
 */

import fs from 'node:fs';
import path from 'node:path';

import {parseMarkdownFrontmatter} from '../markdown/frontmatter.js';
import {validateAndBuildAgent} from './validator.js';
import {getProjectTrustStatus} from '../../safety/projectTrust.js';
import type {AgentDefinition, WorkflowLoadResult, WorkflowValidationIssue} from '../types.js';

const AGENTS_DIR = '.apeironcode/agents';

const readDir = (dir: string): string[] => {
  try {
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
};

export interface LoadAgentOptions {
  /** Skip project trust check (for testing or explicit user override). */
  skipTrustCheck?: boolean;
}

export const loadAgentDefinition = (
  filePath: string,
  source: AgentDefinition['source'],
): WorkflowLoadResult<AgentDefinition> => {
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

  const {definition, issues} = validateAndBuildAgent(
    parsed.data,
    parsed.body,
    filePath,
    source,
  );

  return {
    definition,
    issues,
    trustStatus: definition ? 'allowed' : 'blocked',
    source,
    filePath,
  };
};

export const loadAgentDefinitions = (
  cwd: string,
  options: LoadAgentOptions = {},
): WorkflowLoadResult<AgentDefinition>[] => {
  const agentsDir = path.join(cwd, AGENTS_DIR);
  const filePaths = readDir(agentsDir);
  if (filePaths.length === 0) return [];

  const trustStatus = options.skipTrustCheck
    ? 'trusted'
    : getProjectTrustStatus(cwd).trust;

  if (trustStatus !== 'trusted') {
    return filePaths.map((filePath) => ({
      definition: null,
      issues: [{
        severity: 'warn' as const,
        message: `project agent blocked: project is not trusted (trust=${trustStatus}). Run "apeironcode trust" to enable.`,
      }] as WorkflowValidationIssue[],
      trustStatus: 'blocked' as const,
      source: 'project' as const,
      filePath,
    }));
  }

  return filePaths.map((fp) => loadAgentDefinition(fp, 'project'));
};

export const formatAgentDefinition = (agent: AgentDefinition): string => {
  const lines: string[] = [
    `Agent: ${agent.name}`,
    `Source: ${agent.source}`,
    `Description: ${agent.description}`,
  ];
  if (agent.model) lines.push(`Model: ${agent.model}`);
  if (agent.effort) lines.push(`Effort: ${agent.effort}`);
  if (agent.tools.length > 0) lines.push(`Tools: ${agent.tools.join(', ')}`);
  if (agent.disallowedTools.length > 0) lines.push(`Disallowed Tools: ${agent.disallowedTools.join(', ')}`);
  lines.push(`Permission Mode: ${agent.permissionMode}`);
  if (agent.maxTurns !== undefined) lines.push(`Max Turns: ${agent.maxTurns}`);
  if (agent.skills.length > 0) lines.push(`Skills: ${agent.skills.join(', ')}`);
  if (agent.memory) lines.push(`Memory: ${agent.memory}`);
  if (agent.isolation) lines.push(`Isolation: ${agent.isolation}`);
  // No body or secrets in formatted output by default
  return lines.join('\n');
};
