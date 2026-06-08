import type {SearchScope} from '../../history/searchIndex.js';
import type {ModelRole} from '../../providers/modelCatalog.js';

export const parseCostArguments = (
  args: string[],
): {scope: 'all' | 'current' | 'project' | 'session'; sessionId?: string} | {error: string} => {
  if (args.length === 0) {
    return {scope: 'current'};
  }

  const [scope, maybeSessionId] = args;
  switch (scope) {
    case 'all':
      return {scope: 'all'};
    case 'project':
      return {scope: 'project'};
    case 'session':
      return maybeSessionId ? {scope: 'session', sessionId: maybeSessionId} : {error: 'Usage: /cost session <sessionId>'};
    default:
      return {error: 'Usage: /cost [project|all|session <sessionId>]'};
  }
};

export const parseHistoryArguments = (
  args: string[],
): {all?: boolean; file?: string; limit: number; session?: string} | {error: string} => {
  let all = false;
  let file: string | undefined;
  let limit = 10;
  let session: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--all') {
      all = true;
      continue;
    }

    if (argument === '--file' || argument === '--session') {
      const next = args[index + 1];
      if (!next) {
        return {error: 'Usage: /history [--all] [--file <path>] [--session <sessionId>] [--limit <count>]'};
      }
      if (argument === '--file') {
        file = next;
      } else {
        session = next;
      }
      index += 1;
      continue;
    }

    if (argument === '--limit') {
      const next = args[index + 1];
      const parsed = next ? Number.parseInt(next, 10) : Number.NaN;
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return {error: 'Usage: /history [--all] [--file <path>] [--session <sessionId>] [--limit <count>]'};
      }
      limit = parsed;
      index += 1;
      continue;
    }

    return {error: 'Usage: /history [--all] [--file <path>] [--session <sessionId>] [--limit <count>]'};
  }

  return {all, file, limit, session};
};

export const parseSearchArguments = (
  args: string[],
): {all?: boolean; limit: number; query: string; scope: SearchScope} | {error: string} => {
  let all = false;
  let limit = 10;
  let scope: SearchScope = 'all';
  const queryParts: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument) {
      continue;
    }

    if (argument === '--all') {
      all = true;
      continue;
    }

    if (argument === '--limit') {
      const next = args[index + 1];
      const parsed = next ? Number.parseInt(next, 10) : Number.NaN;
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return {error: 'Usage: /search <query> [--all] [--scope <all|session|task|edit|memory>] [--limit <count>]'};
      }
      limit = parsed;
      index += 1;
      continue;
    }

    if (argument === '--scope') {
      const next = args[index + 1];
      if (next !== 'all' && next !== 'session' && next !== 'task' && next !== 'edit' && next !== 'memory') {
        return {error: 'Usage: /search <query> [--all] [--scope <all|session|task|edit|memory>] [--limit <count>]'};
      }
      scope = next;
      index += 1;
      continue;
    }

    queryParts.push(argument);
  }

  const query = queryParts.join(' ').trim();
  if (!query) {
    return {error: 'Usage: /search <query> [--all] [--scope <all|session|task|edit|memory>] [--limit <count>]'};
  }

  return {all, limit, query, scope};
};

export const normalizeModelRole = (role?: string): ModelRole | undefined => {
  if (role === 'cheap' || role === 'coding' || role === 'fast' || role === 'local' || role === 'reasoning') {
    return role;
  }

  return undefined;
};

export const normalizeNaturalSlashInput = (rawInput: string): string => {
  const trimmed = rawInput.trim();
  const lower = trimmed.toLowerCase();
  if (lower === '/memory') {
    return '/memory review';
  }
  if (lower === '/team') {
    return '/team plan fix failing tests';
  }
  if (lower === '/skills') {
    return '/skills';
  }
  if (lower === '/provider') {
    return '/provider list';
  }
  if (lower === '/security') {
    return '/security status';
  }
  if (lower === '/help' || lower === '/start' || lower === '/status') {
    return trimmed;
  }
  if (lower === '/open dashboard') {
    return '/dashboard';
  }
  if (lower === '/show memory') {
    return '/memory review';
  }
  if (lower === '/show skills') {
    return '/skills';
  }
  if (lower === '/show github') {
    return '/github status';
  }
  if (lower.startsWith('/setup ollama')) {
    return '/setup ollama';
  }
  if (lower.startsWith('/setup openrouter')) {
    return '/setup openrouter';
  }
  if (lower.startsWith('/setup mock')) {
    return '/setup mock';
  }
  if (lower.startsWith('/open cockpit') || lower.startsWith('/open team cockpit')) {
    const parts = trimmed.split(/\s+/u);
    const id = parts.find((part) => part.startsWith('team_'));
    return id ? `/team cockpit ${id}` : '/team runs';
  }
  if (lower === '/review diff') {
    return '/review current diff';
  }
  if (lower === '/fix tests') {
    return '/fix failing tests';
  }
  if (lower === '/explain repo') {
    return '/explain repo';
  }
  return trimmed;
};
