import {describe, expect, it} from 'vitest';

import {decomposeUserRequest} from '../../src/agent/requestDecomposition.js';

describe('decomposeUserRequest', () => {
  it('splits inspect + create folder', () => {
    const actions = decomposeUserRequest(
      'tell me what files are in this repo and create a folder named calendar',
    );
    expect(actions.map((a) => a.kind)).toEqual(['inspect_repo', 'create_folder']);
    expect(actions[1]?.path).toBe('calendar');
    expect(actions[0]?.mutating).toBe(false);
    expect(actions[1]?.mutating).toBe(true);
  });

  it('splits read file + create file', () => {
    const actions = decomposeUserRequest('read app.js and create notes.txt');
    expect(actions.map((a) => a.kind)).toEqual(['read_file', 'create_file']);
  });

  it('returns empty for a single non-combined request', () => {
    expect(decomposeUserRequest('create a folder named calendar')).toEqual([]);
    expect(decomposeUserRequest('improve this app')).toEqual([]);
  });
});
