import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAqiSvg, buildWindSvg, AQI_BANDS } from '../uv-core.js';

const aq = (over = {}) => ({ time: '2026-07-16T13:00', aqi: 58, pm25: 8, pm10: 9, ozone: 150, ...over });
const wp = (over = {}) => ({ time: '2026-07-16T13:00', gust: 12, ...over });

test('buildAqiSvg returns an svg with the AQI line, axis titles, and component readout', () => {
  const svg = buildAqiSvg([aq()]);
  assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
  assert.equal((svg.match(/<polyline/g) || []).length, 1);
  assert.match(svg, /US AQI/);
  assert.match(svg, /hour of day/);
  assert.match(svg, /PM2\.5/);
  assert.match(svg, /µg\/m³/);
});

test('buildAqiSvg draws EPA category bands and never plots above the plot ceiling', () => {
  const svg = buildAqiSvg([aq({ aqi: 180 }), aq({ time: '2026-07-16T14:00', aqi: 30 })], { width: 720, height: 240, pad: 40 });
  assert.ok((svg.match(/<rect/g) || []).length >= 3); // several category bands
  // read the polyline's coordinate pairs (x,y) and check every y is inside the plot
  const poly = svg.match(/<polyline points="([^"]*)"/)[1];
  const ys = poly.split(' ').map((pair) => Number(pair.split(',')[1]));
  assert.ok(ys.length > 0);
  assert.ok(Math.min(...ys) >= 40 - 0.001);
  assert.ok(Math.max(...ys) <= 240 - 40 + 0.001);
});

test('buildAqiSvg readout uses the nowHour point when provided', () => {
  const pts = [aq({ time: '2026-07-16T09:00', pm25: 3 }), aq({ time: '2026-07-16T14:00', pm25: 42 })];
  const svg = buildAqiSvg(pts, { nowHour: 14 });
  assert.match(svg, /PM2\.5 42/);
});

test('buildAqiSvg empty points does not throw', () => {
  assert.match(buildAqiSvg([]), /^<svg[\s\S]*<\/svg>$/);
});

test('AQI_BANDS are contiguous from 0 upward', () => {
  assert.equal(AQI_BANDS[0].min, 0);
  for (let i = 1; i < AQI_BANDS.length; i++) assert.equal(AQI_BANDS[i].min, AQI_BANDS[i - 1].max);
});

test('buildWindSvg returns an svg with a gust line, threshold bands, axis titles', () => {
  const svg = buildWindSvg([wp()]);
  assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
  assert.equal((svg.match(/<polyline/g) || []).length, 1);
  assert.ok((svg.match(/<rect/g) || []).length >= 3); // go/caution/nogo bands
  assert.match(svg, /gust mph/);
  assert.match(svg, /hour of day/);
});

test('buildWindSvg labels the peak gust and never clips a high gust', () => {
  const svg = buildWindSvg([wp({ gust: 5 }), wp({ time: '2026-07-16T15:00', gust: 44 })], { height: 240, pad: 40 });
  assert.match(svg, /peak 44 mph/);
  const ys = [...svg.matchAll(/(?:^|[ ,])[\d.]+,([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(Math.min(...ys) >= 40 - 0.001);
  assert.ok(Math.max(...ys) <= 240 - 40 + 0.001);
});

test('buildWindSvg empty points does not throw', () => {
  assert.match(buildWindSvg([]), /^<svg[\s\S]*<\/svg>$/);
});
