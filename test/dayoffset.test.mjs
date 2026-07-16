import test from 'node:test';
import assert from 'node:assert/strict';
import { dateForOffset, dayLabel, buildSvg, buildTempSvg, buildPrecipSvg } from '../uv-core.js';

test('dateForOffset advances the location-local date by whole days', () => {
  const base = Date.UTC(2026, 6, 16, 18, 0); // 2026-07-16 18:00 UTC
  const off = -5 * 3600; // CDT
  assert.equal(dateForOffset(base, off, 0), '2026-07-16');
  assert.equal(dateForOffset(base, off, 1), '2026-07-17');
  assert.equal(dateForOffset(base, off, 6), '2026-07-22');
});

test('dateForOffset crosses a month boundary correctly', () => {
  const base = Date.UTC(2026, 6, 31, 12, 0); // 2026-07-31
  assert.equal(dateForOffset(base, 0, 1), '2026-08-01');
});

test('dayLabel: Today / Tomorrow / weekday-month-day', () => {
  assert.equal(dayLabel('2026-07-16', 0), 'Today');
  assert.equal(dayLabel('2026-07-17', 1), 'Tomorrow');
  assert.equal(dayLabel('2026-07-18', 2), 'Sat Jul 18'); // 2026-07-18 is a Saturday
});

test('buildSvg includes UV-index and hour axis titles', () => {
  const svg = buildSvg([{ time: '2026-07-16T12:00', uv: 6, uvClear: 7 }]);
  assert.match(svg, /UV index/);
  assert.match(svg, /hour of day/);
});

test('buildTempSvg includes degF and hour axis titles', () => {
  const svg = buildTempSvg([{ time: '2026-07-16T12:00', temp: 80 }]);
  assert.match(svg, /°F/);
  assert.match(svg, /hour of day/);
});

test('buildPrecipSvg includes an hour axis title', () => {
  const svg = buildPrecipSvg([{ time: '2026-07-16T12:00', prob: 40, amount: 0.1 }]);
  assert.match(svg, /hour of day/);
});

test('now-line: present when nowHour given, absent when null, across all three charts', () => {
  const uvPts = [{ time: '2026-07-16T12:00', uv: 6, uvClear: 7 }];
  const tPts = [{ time: '2026-07-16T12:00', temp: 80 }];
  const pPts = [{ time: '2026-07-16T12:00', prob: 40, amount: 0.1 }];
  // with nowHour -> a dashed "now" marker line appears
  assert.match(buildSvg(uvPts, { nowHour: 13 }), /stroke="#4aa8ff"[^>]*stroke-dasharray/);
  assert.match(buildTempSvg(tPts, { nowHour: 13 }), />now<\/text>/);
  assert.match(buildPrecipSvg(pPts, { nowHour: 13 }), /stroke="#4aa8ff"/);
  // without nowHour (future day) -> no now marker
  assert.doesNotMatch(buildSvg(uvPts), /stroke="#4aa8ff"[^>]*stroke-dasharray/);
  assert.doesNotMatch(buildTempSvg(tPts, { nowHour: null }), />now<\/text>/);
  assert.doesNotMatch(buildPrecipSvg(pPts, { nowHour: null }), /stroke="#4aa8ff"/);
});
