import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrecipSvg, buildWeatherTable } from '../uv-core.js';

const P = (h, prob, amount) => ({ time: `2026-07-15T${String(h).padStart(2, '0')}:00`, prob, amount });

test('buildPrecipSvg draws one bar per point and an amount polyline', () => {
  const pts = [P(6, 10, 0), P(7, 80, 0.2), P(8, 40, 0.05)];
  const svg = buildPrecipSvg(pts);
  assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
  assert.equal((svg.match(/<rect/g) || []).length >= 3, true);   // >=3 bars (may include legend swatches)
  assert.equal((svg.match(/<polyline/g) || []).length, 1);       // amount line
});

test('buildPrecipSvg probability bars never exceed the plot height (0-100 fixed)', () => {
  const svg = buildPrecipSvg([P(12, 100, 0.5)], { width: 720, height: 200, pad: 40 });
  const heights = [...svg.matchAll(/<rect[^>]*height="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.ok(Math.max(...heights) <= 200 - 2 * 40 + 0.001);
});

test('buildPrecipSvg empty points does not throw', () => {
  assert.match(buildPrecipSvg([]), /^<svg[\s\S]*<\/svg>$/);
});

test('buildWeatherTable renders a header and one row per point', () => {
  const rows = [{ time: '2026-07-15T06:00', temp: 70, prob: 10, amount: 0 },
                { time: '2026-07-15T07:00', temp: 72, prob: 80, amount: 0.2 }];
  const html = buildWeatherTable(rows);
  assert.match(html, /^<table[\s\S]*<\/table>$/);
  assert.match(html, /Precip %/);
  assert.match(html, /Precip in/);
  assert.equal((html.match(/<tr/g) || []).length, 3); // header + 2 rows
  assert.match(html, /72/);
  assert.match(html, /0\.2/);
});

test('buildWeatherTable empty points renders header only', () => {
  const html = buildWeatherTable([]);
  assert.equal((html.match(/<tr/g) || []).length, 1);
});
