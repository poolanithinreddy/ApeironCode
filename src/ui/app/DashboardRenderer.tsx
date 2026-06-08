import React from 'react';

import {runReviewCockpitAction} from '../../agents/review/reviewActions.js';
import {TeamEventLog} from '../../agents/eventLog.js';
import type {DashboardView} from '../dashboardTypes.js';
import {CostView} from '../CostView.js';
import {HistoryViewer} from '../HistoryViewer.js';
import {HomeDashboard} from '../HomeDashboard.js';
import {ReviewCockpit} from '../ReviewCockpit.js';
import {SearchViewer} from '../SearchViewer.js';
import {TaskViewer} from '../TaskViewer.js';
import {formatUnknownError} from '../../utils/display.js';

export const renderDashboard = ({
  appendLocalAssistantMessage,
  cwd,
  loadReviewCockpitDashboard,
  refreshSessionState,
  setDashboard,
  setStatus,
  visibleDashboard,
}: {
  appendLocalAssistantMessage: (content: unknown) => void;
  cwd: string;
  loadReviewCockpitDashboard: (
    teamRunId: string,
    actionBanner?: Extract<DashboardView, {type: 'review-cockpit'}>['actionBanner'],
  ) => Promise<Extract<DashboardView, {type: 'review-cockpit'}>>;
  refreshSessionState: () => void;
  setDashboard: (dashboard: DashboardView | null) => void;
  setStatus: (status: string) => void;
  visibleDashboard: DashboardView | null;
}): React.ReactNode => {
  if (visibleDashboard?.type === 'home') {
    return <HomeDashboard {...visibleDashboard} />;
  }

  if (visibleDashboard?.type === 'task-detail') {
    return <TaskViewer task={visibleDashboard.task} title={visibleDashboard.title} />;
  }

  if (visibleDashboard?.type === 'task-list') {
    return <TaskViewer tasks={visibleDashboard.tasks} title={visibleDashboard.title} />;
  }

  if (visibleDashboard?.type === 'cost') {
    return <CostView label={visibleDashboard.label} sessions={visibleDashboard.sessions} title={visibleDashboard.title} />;
  }

  if (visibleDashboard?.type === 'history') {
    return (
      <HistoryViewer
        costLabel={visibleDashboard.costLabel}
        editLabel={visibleDashboard.editLabel}
        edits={visibleDashboard.edits}
        includeProjectPath={visibleDashboard.includeProjectPath}
        sessionLabel={visibleDashboard.sessionLabel}
        sessions={visibleDashboard.sessions}
        title={visibleDashboard.title}
      />
    );
  }

  if (visibleDashboard?.type === 'search') {
    return <SearchViewer query={visibleDashboard.query} results={visibleDashboard.results} title={visibleDashboard.title} />;
  }

  if (visibleDashboard?.type !== 'review-cockpit') {
    return null;
  }

  return (
    <ReviewCockpit
      actionBanner={visibleDashboard.actionBanner}
      interactive
      mergePlans={visibleDashboard.mergePlans}
      memorySuggestions={visibleDashboard.memorySuggestions}
      run={visibleDashboard.run}
      workspaces={visibleDashboard.workspaces}
      onAction={(result) => {
        setStatus('Running cockpit action');
        void runReviewCockpitAction({
          cwd,
          mergePlans: visibleDashboard.mergePlans,
          memorySuggestions: visibleDashboard.memorySuggestions,
          result,
          run: visibleDashboard.run,
          workspaces: visibleDashboard.workspaces,
        }).then(async (actionResult) => {
          const banner = {
            kind: actionResult.requiresApproval
              ? 'warning' as const
              : actionResult.success
                ? 'success' as const
                : 'error' as const,
            message: actionResult.message,
            preview: [
              actionResult.preview,
              actionResult.requiresApproval ? 'Approval required before applying destructive changes.' : '',
            ].filter(Boolean).join('\n\n') || undefined,
          };
          if (visibleDashboard.run) {
            setDashboard(await loadReviewCockpitDashboard(visibleDashboard.run.teamRunId, banner));
          }
          appendLocalAssistantMessage(actionResult.message);
          refreshSessionState();
        }).catch((error: unknown) => {
          const message = formatUnknownError(error) || 'Cockpit action failed.';
          setDashboard({
            ...visibleDashboard,
            actionBanner: {
              kind: 'error',
              message,
            },
          });
          appendLocalAssistantMessage(`Cockpit action failed: ${message}`);
        }).finally(() => {
          setStatus('Ready');
        });
      }}
      onClose={() => {
        if (visibleDashboard.run) {
          void new TeamEventLog(cwd).append({
            message: 'Review cockpit closed.',
            task: visibleDashboard.run.goal || visibleDashboard.run.teamRunId,
            teamRunId: visibleDashboard.run.teamRunId,
            type: 'cockpit_closed',
          });
        }
        setDashboard(null);
        appendLocalAssistantMessage('Review cockpit closed.');
      }}
    />
  );
};
