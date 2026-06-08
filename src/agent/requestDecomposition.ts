/**
 * Request decomposition for combined natural-language requests like:
 *   "tell me what files are in this repo and create a folder named calendar"
 *
 * Splits a prompt into ordered sub-actions so the runtime can run the
 * read-only part without approval and ask approval only for the mutating part,
 * producing one coherent answer. Pure detection — no I/O, no provider calls.
 */

export type DecomposedActionKind =
  | 'inspect_repo'
  | 'read_file'
  | 'create_folder'
  | 'create_file'
  | 'run_tests';

export interface DecomposedAction {
  kind: DecomposedActionKind;
  mutating: boolean;
  description: string;
  path?: string;
}

const SPLIT_RE = /\s*(?:,?\s+and\s+|;|,\s+then\s+|\s+then\s+|,)\s*/iu;

const detectClause = (clause: string): DecomposedAction | null => {
  const text = clause.trim().toLowerCase();
  if (!text) return null;

  if (/\b(what|which|list|show|tell me|see)\b.*\b(files?|repo|repository|structure|tree|directory)\b/u.test(text) ||
      /\b(files? are|in this repo|project structure)\b/u.test(text)) {
    return {kind: 'inspect_repo', mutating: false, description: 'List repository files'};
  }

  const folder = text.match(/\b(?:create|make|add|mkdir)\s+(?:a\s+)?(?:new\s+)?(?:folder|directory|dir)\s+(?:named\s+|called\s+)?["'`]?([\w./-]+)["'`]?/u)
    ?? text.match(/\b(?:create|make|add)\s+["'`]?([\w./-]+)["'`]?\s+(?:folder|directory|dir)\b/u);
  if (folder?.[1]) {
    return {kind: 'create_folder', mutating: true, path: folder[1], description: `Create folder ${folder[1]}`};
  }

  const file = text.match(/\b(?:create|make|add|touch|new)\s+(?:a\s+)?(?:new\s+)?(?:file\s+)?(?:named\s+|called\s+)?["'`]?([\w./-]+\.[a-z0-9]+)["'`]?/u);
  if (file?.[1]) {
    return {kind: 'create_file', mutating: true, path: file[1], description: `Create file ${file[1]}`};
  }

  const read = text.match(/\b(?:read|show|open|cat|print)\s+(?:the\s+)?(?:file\s+)?["'`]?([\w./-]+\.[a-z0-9]+)["'`]?/u);
  if (read?.[1]) {
    return {kind: 'read_file', mutating: false, path: read[1], description: `Read ${read[1]}`};
  }

  if (/\b(run|execute)\s+(?:the\s+)?(?:unit\s+)?tests?\b/u.test(text)) {
    return {kind: 'run_tests', mutating: true, description: 'Run the test suite'};
  }

  return null;
};

/**
 * Decompose a prompt into ordered sub-actions. Returns an empty array when the
 * prompt is not a recognizable combined deterministic request (the caller
 * should fall back to the normal agent/coding path).
 */
// Editing / code-change / command verbs mean this is a real coding task that
// must stay on the agent loop — NOT a deterministic inspect+create combo.
const NON_DETERMINISTIC_RE =
  /\b(replace|edit|modify|refactor|implement|fix|change|update|rename|move|run|npm|pnpm|yarn|test|tests|build|delete|remove|install|deploy|commit)\b/iu;

const SAFE_KINDS = new Set<DecomposedActionKind>([
  'inspect_repo',
  'read_file',
  'create_folder',
  'create_file',
]);

export const decomposeUserRequest = (prompt: string): DecomposedAction[] => {
  if (NON_DETERMINISTIC_RE.test(prompt)) return [];
  const clauses = prompt.split(SPLIT_RE).map((c) => c.trim()).filter(Boolean);
  if (clauses.length < 2) return [];
  const actions: DecomposedAction[] = [];
  for (const clause of clauses) {
    const action = detectClause(clause);
    if (action) actions.push(action);
  }
  // Only a safe deterministic combo: every recognized sub-action must be
  // read-only or a simple create, with at least one read-only part and at
  // least one mutating create.
  if (actions.length < 2) return [];
  if (!actions.every((a) => SAFE_KINDS.has(a.kind))) return [];
  if (!actions.some((a) => !a.mutating)) return [];
  if (!actions.some((a) => a.mutating)) return [];
  return actions;
};

/** A combined request needs a provider only if no sub-action needs one (none do). */
export const decompositionNeedsProvider = (): boolean => false;
