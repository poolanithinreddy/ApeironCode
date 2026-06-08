import {describe, expect, it} from 'vitest';

import {
  normalizeModelRole,
  normalizeNaturalSlashInput,
  parseCostArguments,
  parseHistoryArguments,
  parseSearchArguments,
} from '../../../src/ui/commands/parser.js';

describe('slash command parser helpers', () => {
  it('parses cost scopes and reports invalid input', () => {
    expect(parseCostArguments([])).toEqual({scope: 'current'});
    expect(parseCostArguments(['project'])).toEqual({scope: 'project'});
    expect(parseCostArguments(['all'])).toEqual({scope: 'all'});
    expect(parseCostArguments(['session', 'session-1'])).toEqual({scope: 'session', sessionId: 'session-1'});
    expect(parseCostArguments(['session'])).toEqual({error: 'Usage: /cost session <sessionId>'});
    expect(parseCostArguments(['bad'])).toEqual({error: 'Usage: /cost [project|all|session <sessionId>]'});
  });

  it('parses history filters without losing defaults', () => {
    expect(parseHistoryArguments(['--all', '--file', 'src/a.ts', '--session', 's1', '--limit', '3'])).toEqual({
      all: true,
      file: 'src/a.ts',
      limit: 3,
      session: 's1',
    });
    expect(parseHistoryArguments([])).toEqual({all: false, file: undefined, limit: 10, session: undefined});
    expect(parseHistoryArguments(['--limit', '0'])).toEqual({
      error: 'Usage: /history [--all] [--file <path>] [--session <sessionId>] [--limit <count>]',
    });
  });

  it('parses search queries, scope, all-sessions, and limit', () => {
    expect(parseSearchArguments(['auth', 'memory', '--scope', 'memory', '--all', '--limit', '4'])).toEqual({
      all: true,
      limit: 4,
      query: 'auth memory',
      scope: 'memory',
    });
    expect(parseSearchArguments(['--scope', 'bad', 'query'])).toEqual({
      error: 'Usage: /search <query> [--all] [--scope <all|session|task|edit|memory>] [--limit <count>]',
    });
    expect(parseSearchArguments([])).toEqual({
      error: 'Usage: /search <query> [--all] [--scope <all|session|task|edit|memory>] [--limit <count>]',
    });
  });

  it('normalizes natural slash aliases while preserving ordinary commands', () => {
    expect(normalizeNaturalSlashInput('/open dashboard')).toBe('/dashboard');
    expect(normalizeNaturalSlashInput('/show memory')).toBe('/memory review');
    expect(normalizeNaturalSlashInput('/open team cockpit team_123')).toBe('/team cockpit team_123');
    expect(normalizeNaturalSlashInput('/fix tests')).toBe('/fix failing tests');
    expect(normalizeNaturalSlashInput('/review current diff')).toBe('/review current diff');
  });

  it('normalizes model roles conservatively', () => {
    expect(normalizeModelRole('coding')).toBe('coding');
    expect(normalizeModelRole('fast')).toBe('fast');
    expect(normalizeModelRole('unknown')).toBeUndefined();
  });
});
