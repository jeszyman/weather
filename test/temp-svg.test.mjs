import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTempSvg } from '../uv-core.js';

const hour = (h, temp) => ({ time: `2026-07-15T${String(h).padStart(2, '0')}:00`, temp });

test('buildTempSvg returns an svg string with one temp polyline', () => {
  const pts = [hour(6, 70), hour(12, 88), hour(18, 79)];
  const svg = buildTempSvg(pts);
  assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
  assert.equal((svg.match(/<polyline/g) || []).length, 1);
});

test('buildTempSvg enforces a minimum 10F span on narrow sub-freezing data (no clip)', () => {
  const pts = [hour(6, 28), hour(12, 34), hour(18, 30)];
  const svg = buildTempSvg(pts, { width: 720, height: 240, pad: 40 });
  const ys = [...svg.matchAll(/(?:^|[ ,])[\d.]+,([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(ys.length > 0);
  assert.ok(Math.min(...ys) >= 40 - 0.001);          // no clip at top
  assert.ok(Math.max(...ys) <= 240 - 40 + 0.001);    // no clip at bottom
});

test('buildTempSvg labels the high and low', () => {
  const svg = buildTempSvg([hour(6, 61), hour(14, 90)]);
  assert.match(svg, /90/);
  assert.match(svg, /61/);
});

test('buildTempSvg with empty points does not throw', () => {
  assert.match(buildTempSvg([]), /^<svg[\s\S]*<\/svg>$/);
});
