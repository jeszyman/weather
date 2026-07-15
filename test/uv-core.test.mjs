import test from 'node:test';
import assert from 'node:assert/strict';
import { filterToday, computeCeiling, findPeak, WHO_BANDS } from '../uv-core.js';

test('filterToday keeps only matching local date and zips arrays', () => {
  const time = ['2026-07-13T23:00', '2026-07-14T00:00', '2026-07-14T13:00', '2026-07-15T00:00'];
  const uv = [0, 1, 8, 2];
  const uvClear = [0, 1, 9, 2];
  const out = filterToday(time, uv, uvClear, '2026-07-14');
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { time: '2026-07-14T00:00', uv: 1, uvClear: 1 });
  assert.deepEqual(out[1], { time: '2026-07-14T13:00', uv: 8, uvClear: 9 });
});

test('computeCeiling floors at 11 and rounds up above it', () => {
  assert.equal(computeCeiling([{ uv: 3 }, { uv: 7 }]), 11);
  assert.equal(computeCeiling([{ uv: 11.2 }]), 12);
  assert.equal(computeCeiling([]), 11);
});

test('findPeak returns highest uv and its time, first on ties', () => {
  const pts = [{ time: 'a', uv: 2 }, { time: 'b', uv: 8 }, { time: 'c', uv: 8 }];
  assert.deepEqual(findPeak(pts), { uv: 8, time: 'b' });
});

test('WHO_BANDS covers 0..12 contiguously', () => {
  assert.equal(WHO_BANDS[0].min, 0);
  assert.equal(WHO_BANDS.at(-1).max >= 11, true);
});
