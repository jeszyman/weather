import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMatrix } from '../uv-core.js';

const hr = (over = {}) => ({ hour: 13, isDay: 1, uv: 1, aqi: 20, code: 0, cape: 0, gust: 5, appT: 60, precip: 0, ...over });

test('buildMatrix returns a table with a header and six metric rows', () => {
  const html = buildMatrix([hr()]);
  assert.match(html, /^<table[\s\S]*<\/table>$/);
  // 1 header row + 6 metric rows
  assert.equal((html.match(/<tr/g) || []).length, 7);
  for (const label of ['UV', 'Air quality', 'Thunderstorm', 'Feels like', 'Wind gusts', 'Precip']) {
    assert.ok(html.includes(label), `missing row label ${label}`);
  }
});

test('buildMatrix colors cells by classifier and tags night columns', () => {
  const day = hr({ hour: 13, isDay: 1, uv: 9 });    // uv 9 -> nogo
  const night = hr({ hour: 3, isDay: 0, uv: 0 });    // uv 0 -> go, night
  const html = buildMatrix([day, night]);
  assert.match(html, /class="nogo"[^>]*title="UV 13:00: nogo"/);
  assert.match(html, /class="go night"[^>]*title="UV 03:00: go"/);
});

test('buildMatrix cells carry a colorblind glyph', () => {
  const html = buildMatrix([hr({ uv: 9 })]); // nogo glyph
  assert.match(html, /✕/);
  const html2 = buildMatrix([hr({ uv: 0 })]); // go glyph
  assert.match(html2, /·/);
});

test('buildMatrix caution cells emit the caution glyph', () => {
  const html = buildMatrix([hr({ uv: 5 })]); // uv 5 -> caution
  assert.match(html, /–/);
});

test('buildMatrix data cells carry an aria-label matching their title', () => {
  const html = buildMatrix([hr({ hour: 13, uv: 1 })]);
  assert.match(html, /aria-label="UV 13:00: /);
  const tds = html.match(/<td[^>]*>/g) || [];
  assert.ok(tds.length > 0);
  for (const td of tds) {
    const titleMatch = td.match(/title="([^"]*)"/);
    const ariaMatch = td.match(/aria-label="([^"]*)"/);
    assert.ok(titleMatch && ariaMatch, `cell missing title or aria-label: ${td}`);
    assert.equal(ariaMatch[1], titleMatch[1]);
  }
});

test('buildMatrix storm row uses code-beats-cape', () => {
  const html = buildMatrix([hr({ hour: 14, code: 95, cape: 0 })]);
  assert.match(html, /title="Thunderstorm 14:00: nogo"/);
});

test('buildMatrix stormWarning forces the storm cell to nogo', () => {
  const base = { hour: 14, isDay: 1, uv: 1, aqi: 20, code: 0, cape: 0, gust: 5, appT: 60, precip: 0 };
  const normal = buildMatrix([base]);
  assert.match(normal, /title="Thunderstorm 14:00: go"/); // code0/cape0 -> go normally
  const warned = buildMatrix([{ ...base, stormWarning: true }]);
  assert.match(warned, /title="Thunderstorm 14:00: nogo \(NWS warning\)"/);
});

test('buildMatrix empty hours does not throw', () => {
  const html = buildMatrix([]);
  assert.match(html, /^<table[\s\S]*<\/table>$/);
  assert.equal((html.match(/<tr/g) || []).length, 7); // header + 6 label rows, no data cells
});
