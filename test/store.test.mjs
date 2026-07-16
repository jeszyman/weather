import test from 'node:test';
import assert from 'node:assert/strict';
import { validateState, seedState } from '../uv-core.js';

test('seedState returns Olivette default', () => {
  const s = seedState();
  assert.equal(s.v, 1);
  assert.equal(s.activeIdx, 0);
  assert.equal(s.locations[0].name, 'Olivette, MO');
  assert.equal(s.locations[0].lat, 38.67);
});

test('validateState re-seeds on null / garbage / bad JSON', () => {
  assert.deepEqual(validateState(null), seedState());
  assert.deepEqual(validateState('not json{'), seedState());
  assert.deepEqual(validateState('{"v":2,"locations":[],"activeIdx":0}'), seedState());
  assert.deepEqual(validateState('{"v":1,"locations":[],"activeIdx":0}'), seedState()); // empty
  assert.deepEqual(validateState('{"v":1,"locations":[{"name":"X","lat":1,"lon":2}],"activeIdx":5}'), seedState()); // idx OOR
});

test('validateState passes a well-formed state through', () => {
  const good = { v: 1, locations: [{ name: 'X', lat: 1, lon: 2 }, { name: 'Y', lat: 3, lon: 4 }], activeIdx: 1 };
  assert.deepEqual(validateState(JSON.stringify(good)), good);
});

test('validateState rejects locations with non-finite coords', () => {
  assert.deepEqual(validateState('{"v":1,"locations":[{"name":"X","lat":"a","lon":2}],"activeIdx":0}'), seedState());
});
