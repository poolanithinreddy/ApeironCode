import fs from 'node:fs/promises';
import path from 'node:path';

import {TeamArtifactStore} from '../artifacts/store.js';
import type {TeamRunRecord} from '../artifacts/types.js';
import {TeamEventLog} from '../eventLog.js';
import {exportTeamPatch, formatPatchValidation, setResolution, validateTeamPatch} from '../workspace/resolution.js';
import type {MergePlan, SubagentWorkspace} from '../workspace/types.js';
import {MemorySuggestionStore, type MemorySuggestion} from '../../memory/suggestions.js';
import {ensureDirectory} from '../../utils/fs.js';
import {getProjectConfigDir} from '../../utils/paths.js';
import type {ReviewCockpitKeyResult} from '../../ui/reviewCockpitKeys.js';
import type {ReviewCockpitState} from '../../ui/reviewCockpitState.js';

export interface ReviewActionInput {
  cwd: string;
  mergePlans: MergePlan[];
  memorySuggestions: MemorySuggestion[];
  result: ReviewCockpitKeyResult;
  run: TeamRunRecord | null;
  workspaces: SubagentWorkspace[];
}

export interface ReviewActionResult {
  message: string;
  preview?: string;
  requiresApproval?: boolean;
  success: boolean;
}

const clampSelection = (state: ReviewCockpitState, length: number): number =>
  Math.max(0, Math.min(Math.max(0, length - 1), state.selection));

const teamRunDir = (cwd: string, teamRunId: string): string =>
  path.join(getProjectConfigDir(cwd), 'team-runs', teamRunId);

const appendEvent = async (cwd: string, run: TeamRunRecord, type: Parameters<TeamEventLog['append']>[0]['type'], message: string) => {
  await new TeamEventLog(cwd).append({
    message,
    task: run.goal || run.teamRunId,
    teamRunId: run.teamRunId,
    type,
  });
};

const selectedConflict = (plans: MergePlan[], state: ReviewCockpitState) => {
  const conflicts = plans.flatMap((plan) => plan.conflictDetails ?? []);
  return conflicts[clampSelection(state, conflicts.length)] ?? null;
};

const selectedMemory = (suggestions: MemorySuggestion[], state: ReviewCockpitState) =>
  suggestions[clampSelection(state, suggestions.length)] ?? null;

const selectedArtifact = (run: TeamRunRecord, state: ReviewCockpitState) =>
  run.artifacts[clampSelection(state, run.artifacts.length)] ?? null;

export const runReviewCockpitAction = async (input: ReviewActionInput): Promise<ReviewActionResult> => {
  const {cwd, mergePlans, memorySuggestions, result, run} = input;
  if (!run) {
    return {message: 'Team run not found.', success: false};
  }
  const action = result.action;
  const state = result.state;
  if (!action) {
    return {message: 'No cockpit action selected.', success: false};
  }
  await appendEvent(cwd, run, 'cockpit_action', `Cockpit action: ${action} on ${state.pane}`);

  if (action === 'open') {
    if (state.pane === 'artifacts') {
      const artifact = selectedArtifact(run, state);
      if (!artifact) {
        return {message: 'No artifact selected.', success: false};
      }
      const selected = await new TeamArtifactStore(cwd).readArtifact(run.teamRunId, artifact.id);
      await appendEvent(cwd, run, 'artifact_opened', `Artifact opened: ${artifact.id}`);
      return {
        message: `Opened artifact ${artifact.id}.`,
        preview: selected?.content.slice(0, 1600) ?? 'Artifact content unavailable.',
        success: Boolean(selected),
      };
    }
    if (state.pane === 'conflicts') {
      const conflict = selectedConflict(mergePlans, state);
      return conflict
        ? {message: `Conflict selected: ${conflict.path}`, preview: `${conflict.type}: ${conflict.reason}`, success: true}
        : {message: 'No conflict selected.', success: false};
    }
    return {message: `Opened ${state.pane} pane.`, success: true};
  }

  if (action === 'export') {
    if (state.pane === 'artifacts') {
      const artifact = selectedArtifact(run, state);
      if (!artifact) {
        return {message: 'No artifact selected.', success: false};
      }
      const selected = await new TeamArtifactStore(cwd).readArtifact(run.teamRunId, artifact.id);
      if (!selected) {
        return {message: 'Artifact content unavailable.', success: false};
      }
      const exportPath = path.join(teamRunDir(cwd, run.teamRunId), 'exports', `${artifact.id}.md`);
      await ensureDirectory(path.dirname(exportPath));
      await fs.writeFile(exportPath, selected.content, 'utf8');
      await appendEvent(cwd, run, 'artifact_exported', `Artifact exported: ${artifact.id}`);
      return {message: `Artifact exported: ${exportPath}`, success: true};
    }
    const patchPath = await exportTeamPatch(cwd, run.teamRunId);
    return {message: `Patch exported: ${patchPath}`, success: true};
  }

  if (action === 'reject') {
    if (state.pane === 'memory') {
      const suggestion = selectedMemory(memorySuggestions, state);
      if (!suggestion) {
        return {message: 'No memory suggestion selected.', success: false};
      }
      await new MemorySuggestionStore(cwd).reject(suggestion.id);
      await appendEvent(cwd, run, 'memory_suggestion_rejected', `Memory suggestion rejected: ${suggestion.id}`);
      return {message: `Memory suggestion rejected: ${suggestion.id}`, success: true};
    }
    if (state.pane === 'conflicts') {
      const conflict = selectedConflict(mergePlans, state);
      if (!conflict) {
        return {message: 'No conflict selected.', success: false};
      }
      await setResolution(cwd, run.teamRunId, conflict.path, 'skip');
      await appendEvent(cwd, run, 'conflict_skipped', `Conflict skipped: ${conflict.path}`);
      return {message: `Marked conflict skipped: ${conflict.path}`, success: true};
    }
    return {message: 'Reject/skip is available on memory and conflicts panes.', success: false};
  }

  if (action === 'apply') {
    if (state.pane === 'memory') {
      const suggestion = selectedMemory(memorySuggestions, state);
      if (!suggestion) {
        return {message: 'No memory suggestion selected.', success: false};
      }
      await new MemorySuggestionStore(cwd).apply(suggestion.id);
      await appendEvent(cwd, run, 'memory_suggestion_approved', `Memory suggestion approved: ${suggestion.id}`);
      return {message: `Memory suggestion approved: ${suggestion.id}`, success: true};
    }
    if (state.pane === 'conflicts') {
      const conflict = selectedConflict(mergePlans, state);
      if (!conflict) {
        return {message: 'No conflict selected.', success: false};
      }
      await setResolution(cwd, run.teamRunId, conflict.path, 'manual');
      await appendEvent(cwd, run, 'conflict_marked_manual', `Conflict marked manual: ${conflict.path}`);
      return {message: `Marked conflict for manual resolution: ${conflict.path}`, success: true};
    }
    const patchPath = await exportTeamPatch(cwd, run.teamRunId);
    const validation = await validateTeamPatch(cwd, run.teamRunId, patchPath);
    await appendEvent(cwd, run, 'merge_apply_requested', `Merge apply requested. ${validation.ok ? 'Patch validation passed.' : 'Patch validation failed.'}`);
    return {
      message: validation.ok ? 'Merge apply requires approval outside the cockpit.' : 'Patch validation failed; merge apply blocked.',
      preview: formatPatchValidation(validation),
      requiresApproval: true,
      success: validation.ok,
    };
  }

  if (action === 'discard') {
    return {
      message: `Discard requires explicit approval: apeironcode team discard ${run.teamRunId}`,
      requiresApproval: true,
      success: false,
    };
  }

  return {message: `Unhandled cockpit action: ${action}`, success: false};
};
