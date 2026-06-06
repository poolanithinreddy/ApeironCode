import type {MemoryKind, MemoryScope} from './taxonomy.js';

export type RetrievalTaskType =
  | 'architecture'
  | 'connector'
  | 'debug'
  | 'edit'
  | 'explain'
  | 'github'
  | 'mcp'
  | 'review'
  | 'test_fix'
  | 'unknown';

export interface RetrievalPlan {
  excludeSuperseded: boolean;
  explanation: string;
  kinds: MemoryKind[];
  maxDetailedItems?: number;
  maxItems: number;
  maxTokens: number;
  minConfidence: number;
  scopes: MemoryScope[];
  taskType: RetrievalTaskType;
}

const TASK_SIGNALS: Array<{type: RetrievalTaskType; cues: RegExp}> = [
  {cues: /\b(tests?|specs?|failing|assertion|vitest|jest|pytest)\b/iu, type: 'test_fix'},
  {cues: /\b(debug|error|exception|traceback|stack trace|crash|broken)\b/iu, type: 'debug'},
  {cues: /\b(architect|design|diagram|system|structure|monorepo|dependency)\b/iu, type: 'architecture'},
  {cues: /\b(github|pr|pull request|issue|ci|workflow|action)\b/iu, type: 'github'},
  {cues: /\b(mcp|model context protocol|stdio|sse|mcp resource|mcp prompt)\b/iu, type: 'mcp'},
  {cues: /\b(connector|linear|jira|slack|webhook|integration)\b/iu, type: 'connector'},
  {cues: /\b(review|audit|check|scan|analyze|lint)\b/iu, type: 'review'},
  {cues: /\b(explain|what is|how does|describe|summary|overview)\b/iu, type: 'explain'},
  {cues: /\b(edit|fix|change|update|refactor|add|implement|create)\b/iu, type: 'edit'},
];

const KIND_MAP: Record<RetrievalTaskType, MemoryKind[]> = {
  architecture: ['decision', 'project_fact', 'convention', 'reference'],
  connector: ['project_fact', 'convention', 'reference', 'pitfall'],
  debug: ['pitfall', 'fix_recipe', 'convention', 'project_fact'],
  edit: ['convention', 'decision', 'pitfall', 'project_fact'],
  explain: ['project_fact', 'decision', 'reference'],
  github: ['project_fact', 'convention', 'pitfall', 'command'],
  mcp: ['project_fact', 'convention', 'reference', 'pitfall'],
  review: ['convention', 'decision', 'pitfall', 'project_fact'],
  test_fix: ['fix_recipe', 'pitfall', 'command', 'convention', 'project_fact'],
  unknown: ['project_fact', 'convention', 'decision', 'pitfall'],
};

const SCOPE_MAP: Record<RetrievalTaskType, MemoryScope[]> = {
  architecture: ['project', 'global'],
  connector: ['project'],
  debug: ['project'],
  edit: ['project', 'global'],
  explain: ['project', 'global'],
  github: ['project'],
  mcp: ['project'],
  review: ['project', 'global'],
  test_fix: ['project', 'global'],
  unknown: ['project', 'global'],
};

const BUDGET_MAP: Record<RetrievalTaskType, {maxItems: number; maxTokens: number}> = {
  architecture: {maxItems: 12, maxTokens: 1200},
  connector: {maxItems: 8, maxTokens: 800},
  debug: {maxItems: 10, maxTokens: 1000},
  edit: {maxItems: 8, maxTokens: 800},
  explain: {maxItems: 6, maxTokens: 600},
  github: {maxItems: 8, maxTokens: 800},
  mcp: {maxItems: 8, maxTokens: 800},
  review: {maxItems: 10, maxTokens: 1000},
  test_fix: {maxItems: 10, maxTokens: 1000},
  unknown: {maxItems: 8, maxTokens: 800},
};

export const classifyRetrievalTask = (prompt: string): RetrievalTaskType => {
  for (const {type, cues} of TASK_SIGNALS) {
    if (cues.test(prompt)) return type;
  }
  return 'unknown';
};

export const planMemoryRetrieval = (
  prompt: string,
  overrides: Partial<Pick<RetrievalPlan, 'maxItems' | 'maxTokens' | 'minConfidence' | 'scopes'>> = {},
): RetrievalPlan => {
  const taskType = classifyRetrievalTask(prompt);
  const budget = BUDGET_MAP[taskType];
  const kinds = KIND_MAP[taskType];
  const scopes = overrides.scopes ?? SCOPE_MAP[taskType];

  return {
    excludeSuperseded: true,
    explanation: `Task classified as '${taskType}'; retrieving ${kinds.join(', ')} from ${scopes.join('+')} scope`,
    kinds,
    maxDetailedItems: taskType === 'explain' ? 3 : taskType === 'architecture' ? 8 : 5,
    maxItems: overrides.maxItems ?? budget.maxItems,
    maxTokens: overrides.maxTokens ?? budget.maxTokens,
    minConfidence: overrides.minConfidence ?? 0.4,
    scopes,
    taskType,
  };
};

export const shouldIncludeEntity = (
  entityKind: MemoryKind,
  plan: RetrievalPlan,
): boolean => plan.kinds.includes(entityKind);
