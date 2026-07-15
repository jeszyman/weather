import test from 'node:test';
import assert from 'node:assert/strict';
import { filterToday, todayIndices, computeCeiling, findPeak, WHO_BANDS, locationToday } from '../uv-core.js';

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

test('locationToday derives the location-local date from utc offset, independent of viewer tz', () => {
  // 2026-07-14T04:30 UTC, location offset -5h (CDT) => still 2026-07-13 locally (23:30)
  const ms = Date.UTC(2026, 6, 14, 4, 30);
  assert.equal(locationToday(ms, -5 * 3600), '2026-07-13');
  // 2026-07-14T05:00 UTC, -5h => 2026-07-14 00:00 locally
  assert.equal(locationToday(Date.UTC(2026, 6, 14, 5, 0), -5 * 3600), '2026-07-14');
});

test('todayIndices returns indices whose time starts with the date', () => {
  const time = ['2026-07-14T23:00', '2026-07-15T00:00', '2026-07-15T13:00', '2026-07-16T00:00'];
  assert.deepEqual(todayIndices(time, '2026-07-15'), [1, 2]);
  assert.deepEqual(todayIndices(time, '2026-07-14'), [0]);
  assert.deepEqual(todayIndices(time, '2026-07-17'), []);
});
