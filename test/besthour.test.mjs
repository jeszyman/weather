import test from 'node:test';
import assert from 'node:assert/strict';
import { hourScore, bestHour, buildMatrix } from '../uv-core.js';

// A fully-green daytime hour (all classifiers go).
const green = (over = {}) => ({ hour: 12, isDay: 1, uv: 1, aqi: 20, code: 0, cape: 0, gust: 5, appT: 60, precip: 0, ...over });

test('hourScore is 0 for an all-go hour', () => {
  assert.equal(hourScore(green()), 0);
});

test('hourScore weights a single nogo (4) above several cautions', () => {
  const oneNogo = hourScore(green({ uv: 9 }));           // UV nogo -> 4
  const twoCaution = hourScore(green({ uv: 5, gust: 25 })); // UV caution + gust caution -> 2
  assert.equal(oneNogo, 4);
  assert.equal(twoCaution, 2);
  assert.ok(oneNogo > twoCaution);
});

test('bestHour picks the lowest-penalty daylight hour, ties to earlier', () => {
  const hours = [
    green({ hour: 8, uv: 9 }),   // score 4
    green({ hour: 12 }),          // score 0  <- best
    green({ hour: 15 }),          // score 0  (tie, but later)
    green({ hour: 18, gust: 25 }),// score 1
  ];
  const b = bestHour(hours);
  assert.equal(b.hour, 12);
  assert.equal(b.score, 0);
});

test('bestHour skips night hours', () => {
  const hours = [
    green({ hour: 3, isDay: 0 }),        // night, score 0 but excluded
    green({ hour: 13, isDay: 1, gust: 25 }), // day, score 1
  ];
  assert.equal(bestHour(hours).hour, 13);
});

test('bestHour returns null when there are no daylight hours', () => {
  assert.equal(bestHour([green({ hour: 2, isDay: 0 })]), null);
});

test('buildMatrix tags clickable rows with data-panel and every cell with data-hour', () => {
  const html = buildMatrix([green({ hour: 14 })]);
  assert.match(html, /data-panel="h-uv"/);       // UV row links to the UV panel
  assert.match(html, /data-panel="h-temp"/);     // Thermal -> temperature panel
  assert.match(html, /data-panel="h-precip"/);   // Precip -> precip panel
  assert.match(html, /data-panel="h-radar"/);    // Thunderstorm -> radar panel
  assert.match(html, /data-hour="14"/);
  // Air quality and Wind gusts have no dedicated panel -> not every row is clickable
  assert.equal((html.match(/data-panel=/g) || []).length, 4);
});
