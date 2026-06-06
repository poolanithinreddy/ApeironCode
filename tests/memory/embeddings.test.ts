import {describe, expect, it} from 'vitest';

import {TextIndex, stem, tokenize} from '../../src/memory/embeddings.js';

describe('memory embeddings', () => {
  it('tokenizes text, removes stopwords, and stems terms', () => {
    expect(tokenize('The running tests connected files in the repo')).toEqual([
      'run',
      'test',
      'connect',
      'file',
      'repo',
    ]);
    expect(stem('running')).toBe('run');
    expect(stem('tests')).toBe('test');
    expect(stem('connected')).toBe('connect');
  });

  it('ranks results with TF-IDF scoring and returns deterministic ordering', () => {
    const index = new TextIndex();
    index.add('auth', 'Auth login regression tests catch session bugs quickly.');
    index.add('sandbox', 'Docker sandbox container isolation and command execution.');
    index.add('parser', 'Parser retries recover from malformed tool JSON payloads.');

    const first = index.query('regression tests session', 3);
    const second = index.query('regression tests session', 3);

    expect(first[0]?.id).toBe('auth');
    expect(first).toEqual(second);
  });

  it('round-trips through serialization and handles empty queries safely', () => {
    const index = new TextIndex();
    index.add('alpha', 'Alpha provider fallback path');
    index.add('beta', 'Beta provider sandbox path');

    const restored = TextIndex.deserialize(index.serialize());

    expect(restored.query('provider fallback', 2)[0]?.id).toBe('alpha');
    expect(restored.query('', 5)).toEqual([]);
    expect(restored.query('   ', 5)).toEqual([]);
  });
});