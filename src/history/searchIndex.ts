import {MemoryManager} from '../agent/memoryManager.js';
import type {ConversationSession} from '../agent/session.js';
import {SessionStore} from '../sessions/store.js';
import {TaskStore} from '../tasks/taskStore.js';
import type {TaskPlan} from '../tasks/types.js';
import {queryEditHistory} from '../tools/patch/editHistory.js';
import type {EditHistoryRecord} from '../tools/patch/types.js';

export type SearchResultKind = 'edit' | 'memory' | 'session' | 'task';
export type SearchScope = 'all' | SearchResultKind;

export interface SearchResult {
  actionHint: string;
  id: string;
  kind: SearchResultKind;
  projectPath?: string;
  score: number;
  snippet: string;
  title: string;
  updatedAt?: string;
}

interface SearchableEntry extends SearchResult {
  haystack: string;
}

export interface SearchWorkspaceHistoryOptions {
  allSessions?: boolean;
  cwd: string;
  limit?: number;
  query: string;
  scope?: SearchScope;
  sessionStore?: SessionStore;
  taskStore?: TaskStore;
}

const tokenize = (query: string): string[] => {
  return query.toLowerCase().split(/\s+/u).map((token) => token.trim()).filter(Boolean);
};

const buildSnippet = (text: string, tokens: string[]): string => {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  if (!normalized) {
    return 'No snippet available.';
  }

  const lower = normalized.toLowerCase();
  const matchIndex = tokens
    .map((token) => lower.indexOf(token))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];

  if (matchIndex === undefined) {
    return normalized.slice(0, 180);
  }

  const start = Math.max(0, matchIndex - 48);
  const end = Math.min(normalized.length, matchIndex + 132);
  return `${start > 0 ? '...' : ''}${normalized.slice(start, end)}${end < normalized.length ? '...' : ''}`;
};

const scoreEntry = (entry: SearchableEntry, query: string, tokens: string[]): number => {
  const haystack = entry.haystack;
  let score = 0;

  if (haystack.includes(query)) {
    score += 8;
  }

  for (const token of tokens) {
    if (entry.title.toLowerCase().includes(token)) {
      score += 5;
    }
    if (haystack.includes(token)) {
      score += 2;
    }
  }

  return score;
};

const toEntry = (entry: Omit<SearchableEntry, 'haystack' | 'score'> & {body: string}): SearchableEntry => {
  return {
    ...entry,
    haystack: [entry.title, entry.body, entry.actionHint, entry.id, entry.projectPath].filter(Boolean).join(' ').toLowerCase(),
    score: 0,
  };
};

const sessionBody = (session: ConversationSession): string => {
  return [
    session.lastGoal,
    session.sessionMemory?.summary,
    session.sessionMemory?.finalResult,
    session.sessionMemory?.decisionsMade.join(' '),
    session.sessionMemory?.failedAttempts.join(' '),
    session.sessionMemory?.followUpTasks?.join(' '),
  ].filter(Boolean).join(' ');
};

const buildSessionEntries = (sessions: ConversationSession[]): SearchableEntry[] => {
  return sessions.map((session) => toEntry({
    actionHint: `apeironcode sessions resume ${session.id}`,
    body: sessionBody(session),
    id: session.id,
    kind: 'session',
    projectPath: session.projectPath,
    snippet: session.sessionMemory?.summary ?? session.lastGoal ?? 'Saved session',
    title: session.title,
    updatedAt: session.updatedAt,
  }));
};

const buildTaskEntries = (tasks: TaskPlan[]): SearchableEntry[] => {
  return tasks.map((task) => toEntry({
    actionHint: `apeironcode continue ${task.id}`,
    body: [
      task.goal,
      task.finalSummary,
      task.steps.map((step) => `${step.title} ${step.status} ${step.result ?? ''} ${step.error ?? ''}`).join(' '),
      task.filesChanged.join(' '),
      task.memorySuggestions.join(' '),
    ].join(' '),
    id: task.id,
    kind: 'task',
    snippet: task.finalSummary ?? task.goal,
    title: `${task.goal} [${task.status}]`,
    updatedAt: task.updatedAt,
  }));
};

const buildEditEntries = (edits: EditHistoryRecord[]): SearchableEntry[] => {
  return edits.map((edit) => toEntry({
    actionHint: `apeironcode revert ${edit.id}`,
    body: [edit.filePath, edit.promptOrGoal, edit.diff, edit.operationType].filter(Boolean).join(' '),
    id: edit.id,
    kind: 'edit',
    snippet: edit.promptOrGoal ?? edit.diff.split('\n').find(Boolean) ?? edit.filePath,
    title: `${edit.operationType} ${edit.filePath}`,
    updatedAt: edit.timestamp,
  }));
};

const buildMemoryEntries = async (
  cwd: string,
  sessions: ConversationSession[],
): Promise<SearchableEntry[]> => {
  const memoryManager = new MemoryManager(cwd);
  const [projectMemory, globalMemory] = await Promise.all([
    memoryManager.loadProjectMemory(),
    memoryManager.loadGlobalMemory(),
  ]);
  const entries: SearchableEntry[] = [];

  if (projectMemory) {
    entries.push(toEntry({
      actionHint: 'apeironcode memory show',
      body: JSON.stringify(projectMemory),
      id: 'project-memory',
      kind: 'memory',
      snippet: memoryManager.formatProjectMemoryPreview(projectMemory) || 'Project memory',
      title: 'Project memory',
    }));
  }

  if (globalMemory) {
    entries.push(toEntry({
      actionHint: 'apeironcode memory show --global',
      body: JSON.stringify(globalMemory),
      id: 'global-memory',
      kind: 'memory',
      snippet: [globalMemory.codingStyle, globalMemory.testStrategy, ...(globalMemory.preferredProviders ?? [])]
        .filter(Boolean)
        .join('; ') || 'Global memory',
      title: 'Global memory',
    }));
  }

  for (const session of sessions) {
    if (!session.sessionMemory) {
      continue;
    }

    entries.push(toEntry({
      actionHint: `apeironcode sessions resume ${session.id}`,
      body: JSON.stringify(session.sessionMemory),
      id: `session-memory:${session.id}`,
      kind: 'memory',
      projectPath: session.projectPath,
      snippet: session.sessionMemory.summary ?? session.sessionMemory.finalResult ?? session.title,
      title: `Session learning ${session.id}`,
      updatedAt: session.updatedAt,
    }));
  }

  return entries;
};

export const searchWorkspaceHistory = async ({
  allSessions = false,
  cwd,
  limit = 20,
  query,
  scope = 'all',
  sessionStore,
  taskStore,
}: SearchWorkspaceHistoryOptions): Promise<SearchResult[]> => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const tokens = tokenize(normalizedQuery);
  const activeSessionStore = sessionStore ?? new SessionStore();
  const activeTaskStore = taskStore ?? new TaskStore(cwd);
  const [sessions, tasks, edits] = await Promise.all([
    activeSessionStore.list(allSessions ? undefined : cwd),
    activeTaskStore.list(),
    queryEditHistory(cwd, {limit: 200}),
  ]);

  const entries = [
    ...(scope === 'all' || scope === 'session' ? buildSessionEntries(sessions) : []),
    ...(scope === 'all' || scope === 'task' ? buildTaskEntries(tasks) : []),
    ...(scope === 'all' || scope === 'edit' ? buildEditEntries(edits) : []),
    ...(scope === 'all' || scope === 'memory' ? await buildMemoryEntries(cwd, sessions) : []),
  ]
    .map((entry) => ({
      ...entry,
      score: scoreEntry(entry, normalizedQuery, tokens),
      snippet: buildSnippet(entry.snippet, tokens),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''))
    .slice(0, limit);

  return entries;
};

export const formatSearchResults = (results: SearchResult[], query: string): string => {
  if (results.length === 0) {
    return `No matches found for "${query}".`;
  }

  return results
    .map((result) => [
      `[${result.kind}] ${result.title}${result.updatedAt ? ` | ${result.updatedAt}` : ''}`,
      `  ${result.snippet}`,
      `  Action: ${result.actionHint}`,
    ].join('\n'))
    .join('\n\n');
};