/**
 * Renders and runs markdown command definitions.
 * Commands render a prompt via {{args}} substitution only.
 * No arbitrary template execution. No shell. No network.
 */

import type {CommandDefinition} from '../types.js';
import {redactSecrets} from '../../share/redactor.js';

export interface CommandRunContext {
  cwd: string;
}

const ARGS_PLACEHOLDER = '{{args}}';
const MAX_ARGS_LENGTH = 2_048;

export const renderCommandPrompt = (
  definition: CommandDefinition,
  args: string,
): string => {
  const safeArgs = args.length > MAX_ARGS_LENGTH
    ? args.slice(0, MAX_ARGS_LENGTH) + '...'
    : args;
  const rendered = definition.body.replaceAll(ARGS_PLACEHOLDER, safeArgs);
  return redactSecrets(rendered);
};

export interface CommandRunResult {
  prompt: string;
  name: string;
  allowedTools: string[];
  permissionMode: CommandDefinition['permissionMode'];
}

export const runMarkdownCommand = (
  definition: CommandDefinition,
  args: string,
  context: CommandRunContext,
): CommandRunResult => {
  void context; // context reserved for future use (cwd, trust, etc.)
  const prompt = renderCommandPrompt(definition, args);
  return {
    prompt,
    name: definition.name,
    allowedTools: definition.allowedTools,
    permissionMode: definition.permissionMode,
  };
};
