import {getAgent} from './registry.js';
import type {SubagentRunResult} from './types.js';

export const runSubagentDryRun = (name: string, task: string): SubagentRunResult => {
  const agent = getAgent(name);
  if (!agent) {
    throw new Error(`Unknown agent: ${name}`);
  }

  return {
    agent: agent.name,
    summary: [
      `${agent.name} is ready to run with scoped tools: ${agent.allowedTools.join(', ') || 'none'}.`,
      `Prompt: ${agent.prompt}`,
      'This CLI command prepares the subagent task; execution through the main agent runtime is approval-gated.',
    ].join('\n'),
    task,
  };
};
