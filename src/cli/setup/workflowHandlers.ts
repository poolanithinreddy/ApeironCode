/**
 * CLI handlers for ApeironCode Markdown workflow extensibility:
 * agents, skills, and commands loaded from .apeironcode/ directories.
 */

import type {CliHandlers} from '../commands.js';
import type {BootstrapRuntimeContext} from './runtimeContext.js';
import {loadProjectWorkflows, listWorkflowsForDisplay} from '../../workflows/registry.js';
import {loadAgentDefinitions, formatAgentDefinition} from '../../workflows/agents/loader.js';
import {loadSkillDefinitions} from '../../workflows/skills/loader.js';
import {formatSkillForPrompt} from '../../workflows/skills/formatter.js';
import {loadCommandDefinitions} from '../../workflows/commands/loader.js';
import {renderCommandPrompt} from '../../workflows/commands/runner.js';
import {getProjectTrustStatus} from '../../safety/projectTrust.js';

const trustNote = (cwd: string): string => {
  const trust = getProjectTrustStatus(cwd).trust;
  if (trust !== 'trusted') {
    return `\n[Note: project trust=${trust}; some items may be blocked. Run "apeironcode trust" to enable auto-loading.]\n`;
  }
  return '';
};

export const createWorkflowHandlers = ({cwd}: BootstrapRuntimeContext): Partial<CliHandlers> => ({
  markdownAgentList(): Promise<void> {
    const registry = loadProjectWorkflows(cwd, {skipTrustCheck: false});
    process.stdout.write(listWorkflowsForDisplay(registry, 'agent'));
    process.stdout.write(trustNote(cwd));
    process.stdout.write('\n');
    return Promise.resolve();
  },

  markdownAgentShow(name: string): Promise<void> {
    const results = loadAgentDefinitions(cwd, {skipTrustCheck: false});
    const found = results.find((r) => r.definition?.name === name);
    if (!found || !found.definition) {
      const blocked = results.find((r) => r.filePath.includes(name));
      if (blocked) {
        process.stdout.write(`Agent "${name}" is blocked: ${blocked.issues.map((i) => i.message).join('; ')}\n`);
      } else {
        process.stdout.write(`Agent not found: ${name}\n`);
        process.stdout.write('Use "apeironcode agent list" (markdown) to see available agents.\n');
      }
      return Promise.resolve();
    }
    process.stdout.write(formatAgentDefinition(found.definition));
    process.stdout.write('\n');
    if (found.issues.length > 0) {
      process.stdout.write('Warnings:\n');
      for (const issue of found.issues) {
        process.stdout.write(`  [${issue.severity}] ${issue.message}\n`);
      }
    }
    return Promise.resolve();
  },

  markdownSkillList(): Promise<void> {
    const registry = loadProjectWorkflows(cwd, {skipTrustCheck: false});
    process.stdout.write(listWorkflowsForDisplay(registry, 'skill'));
    process.stdout.write(trustNote(cwd));
    process.stdout.write('\n');
    return Promise.resolve();
  },

  markdownSkillShow(name: string): Promise<void> {
    const results = loadSkillDefinitions(cwd, {skipTrustCheck: false, includeBody: true});
    const found = results.find((r) => r.definition?.name === name);
    if (!found || !found.definition) {
      process.stdout.write(`Skill not found: ${name}\n`);
      return Promise.resolve();
    }
    process.stdout.write(`Skill: ${found.definition.name}\n`);
    process.stdout.write(`Source: ${found.definition.source}\n`);
    process.stdout.write(`Description: ${found.definition.description}\n`);
    process.stdout.write(`When to use: ${found.definition.whenToUse || '(not specified)'}\n`);
    if (found.definition.allowedTools.length > 0) {
      process.stdout.write(`Allowed tools: ${found.definition.allowedTools.join(', ')}\n`);
    }
    if (found.definition.tokenBudget) {
      process.stdout.write(`Token budget: ${found.definition.tokenBudget}\n`);
    }
    process.stdout.write(`Progressive disclosure: ${found.definition.progressiveDisclosure}\n`);
    if (found.definition.references.length > 0) {
      process.stdout.write(`References (not auto-loaded): ${found.definition.references.join(', ')}\n`);
    }
    process.stdout.write('\n--- Skill Body (compact preview) ---\n');
    process.stdout.write(formatSkillForPrompt(found.definition, 'compact'));
    process.stdout.write('\n');
    return Promise.resolve();
  },

  markdownCommandList(): Promise<void> {
    const registry = loadProjectWorkflows(cwd, {skipTrustCheck: false});
    process.stdout.write(listWorkflowsForDisplay(registry, 'command'));
    process.stdout.write(trustNote(cwd));
    process.stdout.write('\n');
    return Promise.resolve();
  },

  markdownCommandShow(name: string): Promise<void> {
    const results = loadCommandDefinitions(cwd, {skipTrustCheck: false});
    const found = results.find(
      (r) => r.definition?.name === name || r.definition?.aliases.includes(name),
    );
    if (!found || !found.definition) {
      process.stdout.write(`Command not found: ${name}\n`);
      return Promise.resolve();
    }
    const cmd = found.definition;
    process.stdout.write(`Command: ${cmd.name}\n`);
    process.stdout.write(`Source: ${cmd.source}\n`);
    process.stdout.write(`Description: ${cmd.description}\n`);
    if (cmd.aliases.length > 0) process.stdout.write(`Aliases: ${cmd.aliases.join(', ')}\n`);
    if (cmd.argumentHint) process.stdout.write(`Argument hint: ${cmd.argumentHint}\n`);
    if (cmd.allowedTools.length > 0) process.stdout.write(`Allowed tools: ${cmd.allowedTools.join(', ')}\n`);
    process.stdout.write(`Permission mode: ${cmd.permissionMode}\n`);
    process.stdout.write(`Requires trust: ${cmd.requiresTrust}\n`);
    return Promise.resolve();
  },

  markdownCommandRun(name: string, args: string): Promise<void> {
    const results = loadCommandDefinitions(cwd, {skipTrustCheck: false});
    const found = results.find(
      (r) => r.definition?.name === name || r.definition?.aliases.includes(name),
    );

    if (!found) {
      process.stdout.write(`Command not found: ${name}\n`);
      return Promise.resolve();
    }

    if (!found.definition || found.trustStatus === 'blocked') {
      process.stdout.write(`Command "${name}" is blocked:\n`);
      for (const issue of found.issues) {
        process.stdout.write(`  [${issue.severity}] ${issue.message}\n`);
      }
      return Promise.resolve();
    }

    const rendered = renderCommandPrompt(found.definition, args);
    process.stdout.write('--- Rendered command prompt ---\n');
    process.stdout.write(rendered);
    process.stdout.write('\n--- End of prompt ---\n');
    if (found.definition.allowedTools.length > 0) {
      process.stdout.write(`Allowed tools: ${found.definition.allowedTools.join(', ')}\n`);
    }
    process.stdout.write(`Permission mode: ${found.definition.permissionMode}\n`);
    process.stdout.write('[Use this prompt with "apeironcode <prompt>" or pass it to the agent.]\n');
    return Promise.resolve();
  },
});
