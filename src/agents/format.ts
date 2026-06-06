import type {TeamRunResult} from './teamRunner.js';
import type {AgentDefinition, SubagentRunResult, TeamPlan} from './types.js';

export const formatAgents = (agents: AgentDefinition[]): string =>
  agents.map((agent) => `${agent.name} | ${agent.kind} | ${agent.description}`).join('\n');

export const formatAgent = (agent: AgentDefinition): string => [
  `Agent: ${agent.name}`,
  `Kind: ${agent.kind}`,
  `Description: ${agent.description}`,
  `Allowed tools: ${agent.allowedTools.join(', ') || 'none'}`,
  '',
  agent.prompt,
].join('\n');

export const formatSubagentRun = (result: SubagentRunResult): string => [
  `Subagent: ${result.agent}`,
  `Task: ${result.task}`,
  '',
  result.summary,
].join('\n');

export const formatTeamPlan = (plan: TeamPlan): string => [
  `Team plan: ${plan.goal}`,
  `Mode: ${plan.mode}`,
  '',
  ...plan.steps.map((step, index) => `${index + 1}. ${step.id} -> ${step.agent}: ${step.task}${step.dependsOn.length > 0 ? ` (after ${step.dependsOn.join(', ')})` : ''}`),
].join('\n');

export const formatTeamRunResult = (result: TeamRunResult): string => [
  `Team run: ${result.goal}`,
  `Run id: ${result.teamRunId}`,
  `Status: ${result.ok ? 'completed' : 'partial'}`,
    `Events: ${result.eventsPath}`,
    `Workspace mode: ${result.workspaceMode}`,
    '',
    ...result.results.map((step, index) => [
      `${index + 1}. ${step.agent} | ${step.mode} | ${step.ok ? 'ok' : 'failed'}`,
      `Task: ${step.task}`,
      `Workspace: ${step.workspaceRoot}`,
      `Allowed tools: ${step.toolsAllowed.join(', ') || 'none'}`,
      step.summary,
    ].join('\n')),
    '',
    'Workspace diffs:',
    ...result.workspaceDiffs.map((diff) => `${diff.workspace.agentName}: ${diff.files.length} changed file${diff.files.length === 1 ? '' : 's'}`),
].join('\n\n');
