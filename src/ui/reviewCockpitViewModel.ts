import type {TeamRunRecord} from '../agents/artifacts/types.js';
import type {MergePlan, SubagentWorkspace} from '../agents/workspace/types.js';
import type {MemorySuggestion} from '../memory/suggestions.js';
import type {ReviewCockpitState} from './reviewCockpitState.js';

export interface ReviewCockpitViewModel {
  actionHints: string[];
  detailLines: string[];
  helpLines: string[];
  paneLine: string;
  securityNotice: string;
  title: string;
}

export const buildReviewCockpitViewModel = (input: {
  mergePlans: MergePlan[];
  memorySuggestions: MemorySuggestion[];
  run: TeamRunRecord | null;
  state: ReviewCockpitState;
  workspaces: SubagentWorkspace[];
}): ReviewCockpitViewModel => {
  if (!input.run) {
    return {
      actionHints: ['q back', 'apeironcode team runs'],
      detailLines: ['Team run not found.'],
      helpLines: [],
      paneLine: 'Pane: overview',
      securityNotice: 'Limits: no OS sandboxing, no isolated credentials, no cloud execution.',
      title: 'Review Cockpit',
    };
  }

  const conflicts = input.mergePlans.flatMap((plan) => plan.conflictDetails ?? []);
  const cleanFiles = input.mergePlans.flatMap((plan) => plan.cleanFiles ?? []);
  const ignored = input.mergePlans.flatMap((plan) => plan.ignoredFiles ?? []);
  const paneDetails: Record<ReviewCockpitState['pane'], string[]> = {
    actions: [
      `apply: apeironcode team apply ${input.run.teamRunId}`,
      `discard: apeironcode team discard ${input.run.teamRunId}`,
      `export: apeironcode team export ${input.run.teamRunId}`,
    ],
    artifacts: input.run.artifacts.length === 0
      ? ['No artifacts recorded.']
      : input.run.artifacts.map((artifact) => `${artifact.id} | ${artifact.kind} | ${artifact.title}`),
    conflicts: conflicts.length === 0
      ? ['No conflicts.']
      : conflicts.map((conflict) => `${conflict.path} | ${conflict.type} | ${conflict.reason}`),
    events: ['Event log: .apeironcode-agent/teams/events.jsonl', `Workspaces: ${input.workspaces.length}`],
    memory: input.memorySuggestions.length === 0
      ? ['No related memory suggestions.']
      : input.memorySuggestions.map((suggestion) => `${suggestion.id} | ${suggestion.status} | ${suggestion.confidence} | ${suggestion.summary}`),
    merge: [
      `Clean files: ${cleanFiles.length}`,
      `Conflicts: ${conflicts.length}`,
      `Ignored files: ${ignored.length}`,
      ...cleanFiles.slice(0, 8).map((file) => `clean: ${file.rename ? `${file.rename.oldPath} -> ${file.rename.newPath}` : file.path}`),
    ],
    overview: [
      `Status: ${input.run.ok ? 'ok' : 'partial'}`,
      `Goal: ${input.run.goal || 'unknown'}`,
      `Artifacts: ${input.run.artifacts.length}`,
      `Workspaces: ${input.workspaces.length}`,
      `Conflicts: ${conflicts.length}`,
      `Memory suggestions: ${input.memorySuggestions.length}`,
    ],
  };

  return {
    actionHints: ['←/→ panes', '↑/↓ select', 'm merge', 'c conflicts', 'g memory', 'Enter open', 'a apply', 'r reject/skip', 'd discard', 'e export', '? help', 'q back'],
    detailLines: paneDetails[input.state.pane],
    helpLines: input.state.help
      ? ['Keys: arrows navigate, Enter opens, a applies safe action, r rejects/skips, d discards, e exports, q closes.']
      : [],
    paneLine: `Pane: ${input.state.pane} | Selection: ${input.state.selection}`,
    securityNotice: 'Limits: no OS sandboxing, no isolated credentials, no cloud execution, no parallel editing.',
    title: `Review Cockpit: ${input.run.teamRunId}`,
  };
};

export const formatReviewCockpit = (view: ReviewCockpitViewModel): string => [
  view.title,
  view.paneLine,
  view.securityNotice,
  '',
  ...view.detailLines,
  '',
  'Actions:',
  ...view.actionHints.map((hint) => `- ${hint}`),
  ...view.helpLines.length ? ['', ...view.helpLines] : [],
].join('\n');
