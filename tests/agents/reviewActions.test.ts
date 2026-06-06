import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

import {TeamArtifactStore} from '../../src/agents/artifacts/store.js';
import {runReviewCockpitAction} from '../../src/agents/review/reviewActions.js';
import {SubagentWorkspaceManager} from '../../src/agents/workspace/workspaceManager.js';
import {MemorySuggestionStore} from '../../src/memory/suggestions.js';
import {createReviewCockpitState} from '../../src/ui/reviewCockpitState.js';

const makeProject = async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-review-actions-'));
  await fs.mkdir(path.join(cwd, 'src'), {recursive: true});
  await fs.writeFile(path.join(cwd, 'src/example.ts'), 'export const value = 1;\n');
  return cwd;
};

describe('review cockpit actions', () => {
  it('exports patches and approves/rejects memory suggestions from cockpit actions', async () => {
    const cwd = await makeProject();
    const teamRunId = 'team-review-actions';
    const artifactStore = new TeamArtifactStore(cwd);
    const run = await artifactStore.createRun({goal: 'review memory', teamRunId});
    await artifactStore.addArtifact({
      content: 'Summary artifact',
      kind: 'summary',
      teamRunId,
      title: 'Summary',
    });
    const manager = new SubagentWorkspaceManager(cwd);
    const workspace = await manager.createWorkspace({agentName: 'coder', mode: 'temp-copy', teamRunId});
    await fs.writeFile(path.join(workspace.workspaceRoot, 'src/example.ts'), 'export const value = 2;\n');
    const mergePlans = await manager.createMergePlan(teamRunId);
    const suggestion = await new MemorySuggestionStore(cwd).append({
      confidence: 'high',
      proposedFacts: [{
        confidence: 0.9,
        name: 'review memory',
        observation: 'Cockpit can approve memory suggestions.',
        source: 'session',
        type: 'task',
      }],
      relatedSessionId: teamRunId,
      source: 'team',
      summary: 'Remember review cockpit action behavior.',
    });
    const runWithArtifacts = await artifactStore.getRun(teamRunId);
    if (!runWithArtifacts) {
      throw new Error('expected team run');
    }

    const exportResult = await runReviewCockpitAction({
      cwd,
      mergePlans,
      memorySuggestions: [suggestion],
      result: {action: 'export', state: {...createReviewCockpitState(), pane: 'merge'}},
      run: runWithArtifacts,
      workspaces: [workspace],
    });
    expect(exportResult.success).toBe(true);
    expect(exportResult.message).toContain('.patch');

    const approveResult = await runReviewCockpitAction({
      cwd,
      mergePlans,
      memorySuggestions: [suggestion],
      result: {action: 'apply', state: {...createReviewCockpitState(), pane: 'memory'}},
      run,
      workspaces: [workspace],
    });
    expect(approveResult.success).toBe(true);
    expect((await new MemorySuggestionStore(cwd).list())[0]?.status).toBe('applied');
  });
});
