import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSvg } from '../uv-core.js';

const pts = [
  { time: '2026-07-14T06:00', uv: 1, uvClear: 1 },
  { time: '2026-07-14T13:00', uv: 8, uvClear: 9 },
  { time: '2026-07-14T20:00', uv: 0, uvClear: 0 },
];

test('buildSvg returns an svg element string with both series', () => {
  const svg = buildSvg(pts);
  assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
  const polylines = svg.match(/<polyline/g) || [];
  assert.equal(polylines.length, 2); // uv + uvClear
});

test('buildSvg never emits y above the plot ceiling (no clipping at UV 8)', () => {
  const svg = buildSvg(pts, { width: 720, height: 320, pad: 40 });
  // ceiling is 11 here; the UV=8 point y must sit within [pad, height-pad]
  const ys = [...svg.matchAll(/(?:^|[ ,])[\d.]+,([\d.]+)/g)].map(m => Number(m[1]));
  assert.ok(ys.length > 0);
  assert.ok(Math.min(...ys) >= 40 - 0.001);
  assert.ok(Math.max(...ys) <= 320 - 40 + 0.001);
});

test('buildSvg labels the peak UV value', () => {
  assert.match(buildSvg(pts), /peak 8 @/);
});

test('buildSvg with empty points returns svg without throwing', () => {
  assert.match(buildSvg([]), /^<svg[\s\S]*<\/svg>$/);
});
