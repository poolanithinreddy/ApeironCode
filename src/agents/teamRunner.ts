import crypto from 'node:crypto';

import {Agent} from '../agent/Agent.js';
import type {AgentMode} from '../agent/types.js';
import type {ResolvedConfig} from '../config/config.js';
import {providerRegistry} from '../providers/registry.js';
import {createDefaultToolRegistry} from '../tools/registry.js';
import {MemorySuggestionStore} from '../memory/suggestions.js';
import {getAgent} from './registry.js';
import {getSubagentPolicy} from './policies.js';
import {createTeamPlan} from './teamPlanner.js';
import type {AgentDefinition, TeamPlan} from './types.js';
import {TeamEventLog} from './eventLog.js';
import {SubagentWorkspaceManager} from './workspace/workspaceManager.js';
import type {SubagentWorkspaceMode, WorkspaceDiff} from './workspace/types.js';
import {TeamArtifactStore} from './artifacts/store.js';
import {formatTeamPlan} from './format.js';
import {formatWorkspaceDiff} from './workspace/format.js';

export interface TeamSubagentResult {
  agent: string;
  mode: AgentMode;
  ok: boolean;
  summary: string;
  task: string;
  toolsAllowed: string[];
  workspaceRoot: string;
}

export interface TeamRunResult {
  eventsPath: string;
  goal: string;
  ok: boolean;
  plan: TeamPlan;
  results: TeamSubagentResult[];
  summary: string;
  teamRunId: string;
  workspaceDiffs: WorkspaceDiff[];
  workspaceMode: SubagentWorkspaceMode;
}

interface RunTeamOptions {
  config: ResolvedConfig;
  continueOnFailure?: boolean;
  cwd: string;
  workspaceMode?: SubagentWorkspaceMode;
}

const defaultModeForAgent = (agent: AgentDefinition): AgentMode => {
  switch (agent.kind) {
    case 'coder':
      return 'feature';
    case 'debugger':
      return 'debug';
    case 'docs-writer':
      return 'feature';
    case 'reviewer':
    case 'security-reviewer':
      return 'review';
    case 'tester':
      return 'test-fix';
    default:
      return 'explain';
  }
};

const buildSubagentPrompt = (
  agent: AgentDefinition,
  task: string,
  previousResults: TeamSubagentResult[],
): string => [
  `You are the ${agent.name} subagent in an ApeironCode sequential team run.`,
  agent.prompt,
  '',
  `Subagent task: ${task}`,
  '',
  'Allowed tools for this subagent:',
  agent.allowedTools.length > 0 ? agent.allowedTools.map((tool) => `- ${tool}`).join('\n') : '- none',
  '',
  previousResults.length > 0
    ? [
        'Previous subagent results:',
        ...previousResults.map((result) => `- ${result.agent}: ${result.ok ? 'ok' : 'failed'} — ${result.summary.slice(0, 300)}`),
      ].join('\n')
    : 'Previous subagent results: none',
  '',
  'Return a concise subagent result with actions taken, validation, and remaining risks.',
].join('\n');

export const runTeamSequential = async (
  goal: string,
  options: RunTeamOptions,
): Promise<TeamRunResult> => {
  const plan = createTeamPlan(goal);
  const teamRunId = `team_${crypto.randomUUID()}`;
  const eventLog = new TeamEventLog(options.cwd);
  const workspaceMode = options.workspaceMode ?? 'main';
  const workspaceManager = new SubagentWorkspaceManager(options.cwd);
  const artifactStore = new TeamArtifactStore(options.cwd);
  const results: TeamSubagentResult[] = [];
  const workspaceDiffs: WorkspaceDiff[] = [];

  await artifactStore.createRun({goal, teamRunId});
  await artifactStore.addArtifact({
    content: formatTeamPlan(plan),
    kind: 'plan',
    teamRunId,
    title: 'Team plan',
  });

  await eventLog.append({
    message: `Team run started: ${goal}`,
    task: goal,
    teamRunId,
    type: 'team_started',
  });

  try {
    for (const step of plan.steps) {
      const definition = getAgent(step.agent);
      if (!definition) {
        throw new Error(`Unknown subagent: ${step.agent}`);
      }
      const policy = getSubagentPolicy(definition);
      const workspace = await workspaceManager.createWorkspace({
        agentName: definition.name,
        mode: workspaceMode,
        teamRunId,
      });

      await eventLog.append({
        agent: definition.name,
        message: `Subagent started: ${definition.name} in ${workspace.mode} workspace ${workspace.workspaceRoot}`,
        task: step.task,
        teamRunId,
        type: 'subagent_started',
      });

      const toolRegistry = createDefaultToolRegistry();
      toolRegistry.setAllowedTools(policy.allowedTools);
      const agent = new Agent({
        config: options.config,
        cwd: workspace.workspaceRoot,
        providerRegistry,
        toolRegistry,
      });
      const mode = defaultModeForAgent(definition);

      try {
        const run = await agent.run({
          allowModeInference: false,
          mode,
          model: options.config.effective.defaultModel,
          prompt: buildSubagentPrompt(definition, step.task, results),
          providerName: options.config.effective.defaultProvider,
        });
        const workspaceDiff = await workspaceManager.collectDiff(workspace);
        workspaceDiffs.push(workspaceDiff);
        const result: TeamSubagentResult = {
          agent: definition.name,
          mode,
          ok: (run.taskState?.errors.length ?? 0) === 0,
          summary: run.finalMessage.content.trim(),
          task: step.task,
          toolsAllowed: policy.allowedTools,
          workspaceRoot: workspace.workspaceRoot,
        };
        results.push(result);
        await artifactStore.addArtifact({
          content: result.summary,
          kind: 'subagent-output',
          teamRunId,
          title: `${definition.name} output`,
        });
        await artifactStore.addArtifact({
          content: formatWorkspaceDiff(workspaceDiff),
          kind: 'diff',
          teamRunId,
          title: `${definition.name} workspace diff`,
        });
        await eventLog.append({
          agent: definition.name,
          message: result.summary.slice(0, 500),
          task: step.task,
          teamRunId,
          type: result.ok ? 'subagent_completed' : 'subagent_failed',
        });
        if (!result.ok && !options.continueOnFailure) {
          break;
        }
      } catch (error) {
        const result: TeamSubagentResult = {
          agent: definition.name,
          mode,
          ok: false,
          summary: error instanceof Error ? error.message : String(error),
          task: step.task,
          toolsAllowed: policy.allowedTools,
          workspaceRoot: workspace.workspaceRoot,
        };
        results.push(result);
        await eventLog.append({
          agent: definition.name,
          message: result.summary,
          task: step.task,
          teamRunId,
          type: 'subagent_failed',
        });
        if (!options.continueOnFailure) {
          break;
        }
      }
    }

    const ok = results.every((result) => result.ok) && results.length === plan.steps.length;
    const summary = [
      `Team run: ${goal}`,
      `Status: ${ok ? 'completed' : 'partial'}`,
      '',
      ...results.map((result, index) => `${index + 1}. ${result.agent} (${result.mode}) — ${result.ok ? 'ok' : 'failed'}\n${result.summary}`),
      '',
      'Workspace diffs:',
      ...workspaceDiffs.map((diff) => `- ${diff.workspace.agentName}: ${diff.files.length} changed file${diff.files.length === 1 ? '' : 's'} (${diff.workspace.mode})`),
    ].join('\n');

    await new MemorySuggestionStore(options.cwd).append({
      confidence: ok ? 'medium' : 'low',
      proposedFacts: [{
        confidence: ok ? 0.76 : 0.55,
        metadata: {teamRunId, subagents: results.map((result) => result.agent)},
        name: goal.slice(0, 120),
        observation: summary.slice(0, 600),
        source: 'session',
        tags: ['team', 'suggested'],
        type: 'task',
      }],
      relatedSessionId: teamRunId,
      source: 'team',
      summary: `Team run ${ok ? 'completed' : 'partially completed'}: ${goal}`,
    });

    await eventLog.append({
      message: summary.slice(0, 500),
      task: goal,
      teamRunId,
      type: ok ? 'team_completed' : 'team_failed',
    });

    await artifactStore.addArtifact({
      content: summary,
      kind: 'summary',
      teamRunId,
      title: 'Team summary',
    });
    await artifactStore.createRun({goal, ok, teamRunId});

    return {
      eventsPath: 'teams/events.jsonl',
      goal,
      ok,
      plan,
      results,
      summary,
      teamRunId,
      workspaceDiffs,
      workspaceMode,
    };
  } catch (error) {
    await eventLog.append({
      message: error instanceof Error ? error.message : String(error),
      task: goal,
      teamRunId,
      type: 'team_failed',
    });
    throw error;
  }
};
