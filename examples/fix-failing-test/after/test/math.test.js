import assert from 'node:assert/strict';
import test from 'node:test';
import {clampScore} from '../src/math.js';

test('allows the maximum score', () => {
  assert.equal(clampScore(100), 100);
});
