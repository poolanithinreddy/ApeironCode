/**
 * WorkflowRegistry — merges project/global/builtin agents, skills, and commands.
 * Project definitions override global only when trusted.
 * Alias resolution is deterministic. Blocked untrusted workflows are reported.
 */

import type {
  AgentDefinition,
  CommandDefinition,
  SkillDefinition,
  WorkflowDefinitionKind,
  WorkflowRegistrySummary,
  WorkflowValidationIssue,
} from './types.js';
import {loadAgentDefinitions} from './agents/loader.js';
import {loadSkillDefinitions} from './skills/loader.js';
import {loadCommandDefinitions} from './commands/loader.js';

export interface LoadProjectWorkflowsOptions {
  skipTrustCheck?: boolean;
}

export class WorkflowRegistry {
  private agents: Map<string, AgentDefinition> = new Map();
  private skills: Map<string, SkillDefinition> = new Map();
  private commands: Map<string, CommandDefinition> = new Map();
  private aliasMap: Map<string, string> = new Map(); // alias → command name
  private blocked: WorkflowRegistrySummary['blocked'] = [];
  private warnings: WorkflowValidationIssue[] = [];

  loadProjectWorkflows(cwd: string, options: LoadProjectWorkflowsOptions = {}): void {
    // Agents
    const agentResults = loadAgentDefinitions(cwd, options);
    for (const result of agentResults) {
      if (result.definition) {
        const existing = this.agents.get(result.definition.name);
        if (existing) {
          this.warnings.push({
            severity: 'warn',
            message: `duplicate agent name "${result.definition.name}" from ${result.definition.source}; existing ${existing.source} takes precedence`,
          });
        } else {
          this.agents.set(result.definition.name, result.definition);
        }
      } else if (result.trustStatus === 'blocked') {
        const basename = result.filePath.split('/').pop() ?? result.filePath;
        this.blocked.push({
          kind: 'agent',
          name: basename.replace(/\.md$/u, ''),
          reason: result.issues.map((i) => i.message).join('; '),
        });
      }
      for (const issue of result.issues) {
        if (issue.severity === 'warn') this.warnings.push(issue);
      }
    }

    // Skills
    const skillResults = loadSkillDefinitions(cwd, options);
    for (const result of skillResults) {
      if (result.definition) {
        const existing = this.skills.get(result.definition.name);
        if (existing) {
          this.warnings.push({
            severity: 'warn',
            message: `duplicate skill name "${result.definition.name}" from ${result.definition.source}; existing takes precedence`,
          });
        } else {
          this.skills.set(result.definition.name, result.definition);
        }
      } else if (result.trustStatus === 'blocked') {
        const basename = result.filePath.split('/').pop() ?? result.filePath;
        this.blocked.push({
          kind: 'skill',
          name: basename.replace(/\.md$/u, ''),
          reason: result.issues.map((i) => i.message).join('; '),
        });
      }
    }

    // Commands
    const commandResults = loadCommandDefinitions(cwd, options);
    for (const result of commandResults) {
      if (result.definition) {
        const cmd = result.definition;
        const existing = this.commands.get(cmd.name);
        if (existing) {
          this.warnings.push({
            severity: 'warn',
            message: `duplicate command name "${cmd.name}"; existing takes precedence`,
          });
        } else {
          this.commands.set(cmd.name, cmd);
          for (const alias of cmd.aliases) {
            if (this.aliasMap.has(alias)) {
              this.warnings.push({
                severity: 'warn',
                message: `duplicate alias "${alias}" for command "${cmd.name}"; existing takes precedence`,
              });
            } else {
              this.aliasMap.set(alias, cmd.name);
            }
          }
        }
      } else if (result.trustStatus === 'blocked') {
        const basename = result.filePath.split('/').pop() ?? result.filePath;
        this.blocked.push({
          kind: 'command',
          name: basename.replace(/\.md$/u, ''),
          reason: result.issues.map((i) => i.message).join('; '),
        });
      }
    }
  }

  listWorkflowDefinitions(): WorkflowRegistrySummary {
    return {
      agents: [...this.agents.values()],
      skills: [...this.skills.values()],
      commands: [...this.commands.values()],
      blocked: [...this.blocked],
      warnings: [...this.warnings],
    };
  }

  findAgent(name: string): AgentDefinition | undefined {
    return this.agents.get(name);
  }

  findSkill(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  findCommand(nameOrAlias: string): CommandDefinition | undefined {
    const direct = this.commands.get(nameOrAlias);
    if (direct) return direct;
    const resolved = this.aliasMap.get(nameOrAlias);
    if (resolved) return this.commands.get(resolved);
    return undefined;
  }

  validateWorkflows(): WorkflowValidationIssue[] {
    return [...this.warnings];
  }

  getBlockedCount(): number {
    return this.blocked.length;
  }

  getSkills(): SkillDefinition[] {
    return [...this.skills.values()];
  }
}

export const loadProjectWorkflows = (
  cwd: string,
  options: LoadProjectWorkflowsOptions = {},
): WorkflowRegistry => {
  const registry = new WorkflowRegistry();
  registry.loadProjectWorkflows(cwd, options);
  return registry;
};

export const listWorkflowsForDisplay = (
  registry: WorkflowRegistry,
  kind?: WorkflowDefinitionKind,
): string => {
  const summary = registry.listWorkflowDefinitions();
  const lines: string[] = [];

  if (!kind || kind === 'agent') {
    lines.push('Agents:');
    if (summary.agents.length === 0) lines.push('  (none)');
    for (const a of summary.agents) {
      lines.push(`  ${a.name} [${a.source}] — ${a.description}`);
    }
  }

  if (!kind || kind === 'skill') {
    lines.push('Skills:');
    if (summary.skills.length === 0) lines.push('  (none)');
    for (const s of summary.skills) {
      lines.push(`  ${s.name} [${s.source}] — ${s.description}`);
    }
  }

  if (!kind || kind === 'command') {
    lines.push('Commands:');
    if (summary.commands.length === 0) lines.push('  (none)');
    for (const c of summary.commands) {
      const aliases = c.aliases.length > 0 ? ` (aliases: ${c.aliases.join(', ')})` : '';
      lines.push(`  ${c.name}${aliases} [${c.source}] — ${c.description}`);
    }
  }

  if (summary.blocked.length > 0) {
    lines.push(`Blocked (untrusted project): ${summary.blocked.length}`);
    for (const b of summary.blocked) {
      lines.push(`  ${b.kind}/${b.name}: ${b.reason}`);
    }
  }

  return lines.join('\n');
};
