import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrecipSvg, buildWeatherTable } from '../uv-core.js';

const P = (h, prob, amount) => ({ time: `2026-07-15T${String(h).padStart(2, '0')}:00`, prob, amount });

test('buildPrecipSvg draws two single-axis sub-plots (prob + amount bars), no dual axis', () => {
  const pts = [P(6, 10, 0), P(7, 80, 0.2), P(8, 40, 0.05)];
  const svg = buildPrecipSvg(pts);
  assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
  // one prob bar + one amount bar per point = 6 bars for 3 points
  assert.equal((svg.match(/<rect/g) || []).length, 6);
  assert.equal((svg.match(/<polyline/g) || []).length, 0); // no dual-axis amount line anymore
  assert.match(svg, /rain %/);      // top sub-plot axis title
  assert.match(svg, /amount in/);   // bottom sub-plot axis title
  assert.match(svg, /hour of day/); // shared x title
});

test('buildPrecipSvg probability bars stay within the top sub-plot band', () => {
  const svg = buildPrecipSvg([P(12, 100, 0.5)]);
  // the top sub-plot occupies y in [6, 6+130-22]; a 100% bar starts at the band top (6)
  const rects = [...svg.matchAll(/<rect[^>]*y="([\d.]+)"[^>]*height="([\d.]+)"/g)]
    .map((m) => ({ y: Number(m[1]), h: Number(m[2]) }));
  assert.ok(rects.length >= 1);
  // no rect extends above y=6 (the top plot ceiling) or has negative height
  assert.ok(rects.every((r) => r.y >= 6 - 0.001 && r.h >= 0));
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
