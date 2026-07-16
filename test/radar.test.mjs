import test from 'node:test';
import assert from 'node:assert/strict';
import { frameLabel, radarFrames } from '../uv-core.js';

test('frameLabel: 0 is now, else -N min', () => {
  assert.equal(frameLabel(0), 'now');
  assert.equal(frameLabel(5), '-5 min');
  assert.equal(frameLabel(50), '-50 min');
});

test('radarFrames returns 11 frames oldest-to-newest', () => {
  const f = radarFrames();
  assert.equal(f.length, 11);
  assert.equal(f[0].offsetMin, 50);   // oldest first
  assert.equal(f[10].offsetMin, 0);   // newest last
});

test('radarFrames suffixes are zero-padded and current has empty suffix', () => {
  const f = radarFrames();
  const byOffset = Object.fromEntries(f.map((x) => [x.offsetMin, x]));
  assert.equal(byOffset[0].suffix, '');
  assert.equal(byOffset[0].layer, 'nexrad-n0q-900913');
  assert.equal(byOffset[5].suffix, '-m05m');       // zero-padded
  assert.equal(byOffset[5].layer, 'nexrad-n0q-900913-m05m');
  assert.equal(byOffset[50].suffix, '-m50m');
  assert.equal(byOffset[0].label, 'now');
  assert.equal(byOffset[5].label, '-5 min');
});
