import type {ConversationSession} from '../agent/session.js';
import type {SearchResult} from '../history/searchIndex.js';
import type {TaskPlan} from '../tasks/types.js';
import type {EditHistoryRecord} from '../tools/patch/types.js';
import type {AgentSessionRecord} from '../multisession/types.js';
import type {FileLock} from '../multisession/locks.js';
import type {TeamRunRecord} from '../agents/artifacts/types.js';
import type {MergePlan, SubagentWorkspace} from '../agents/workspace/types.js';
import type {MemorySuggestion} from '../memory/suggestions.js';

export type DashboardSession = Pick<ConversationSession, 'id' | 'model' | 'projectPath' | 'provider' | 'title' | 'tokenUsage' | 'updatedAt'>;

export interface DashboardActionBanner {
  kind: 'error' | 'info' | 'success' | 'warning';
  message: string;
  preview?: string;
}

export type DashboardView =
  | {
      activeTask?: TaskPlan | null;
      agentLocks?: FileLock[];
      agentSessions?: AgentSessionRecord[];
      approvalMode?: string;
      codeIntelligenceLine: string;
      gitBranch?: string | null;
      historyHint?: string;
      localOnly?: boolean;
      memorySuggestionCount?: number;
      memorySuggestionSummary?: string;
      modeLabel: string;
      model: string;
      projectSummary: string;
      provider: string;
      providerConfidence?: string | null;
      recentSessions: DashboardSession[];
      setupNeeded?: boolean;
      shortcuts: Array<{command: string; description: string}>;
      teamRunCount?: number;
      title: string;
      type: 'home';
      /** When true (default for auto-start), render the compact home only. */
      compact?: boolean;
      workspacePath: string;
    }
  | {
      label: string;
      sessions: DashboardSession[];
      title: string;
      type: 'cost';
    }
  | {
      costLabel: string;
      editLabel: string;
      edits: EditHistoryRecord[];
      includeProjectPath?: boolean;
      sessionLabel: string;
      sessions: DashboardSession[];
      title: string;
      type: 'history';
    }
  | {
      task: TaskPlan;
      title: string;
      type: 'task-detail';
    }
  | {
      tasks: TaskPlan[];
      title: string;
      type: 'task-list';
    }
  | {
      query: string;
      results: SearchResult[];
      title: string;
      type: 'search';
    }
  | {
      actionBanner?: DashboardActionBanner;
      mergePlans: MergePlan[];
      memorySuggestions: MemorySuggestion[];
      run: TeamRunRecord | null;
      title: string;
      type: 'review-cockpit';
      workspaces: SubagentWorkspace[];
    };
