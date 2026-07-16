import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGeocode, sameLoc, addLocation, removeLocation } from '../uv-core.js';

test('parseGeocode normalizes results and builds a label', () => {
  const json = { results: [
    { name: 'Springfield', admin1: 'Missouri', country_code: 'US', latitude: 37.21533, longitude: -93.29824 },
  ] };
  const out = parseGeocode(json);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { name: 'Springfield', lat: 37.21533, lon: -93.29824, label: 'Springfield, Missouri US' });
});

test('parseGeocode returns [] when results key is absent', () => {
  assert.deepEqual(parseGeocode({ generationtime_ms: 0.1 }), []);
  assert.deepEqual(parseGeocode({}), []);
});

test('parseGeocode skips entries with non-finite coords or missing name', () => {
  const json = { results: [
    { name: 'Good', latitude: 1, longitude: 2 },
    { name: 'NoLon', latitude: 1 },
    { latitude: 3, longitude: 4 },
    { name: 'NaNlat', latitude: 'x', longitude: 4 },
  ] };
  const out = parseGeocode(json);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'Good');
});

test('sameLoc compares coordinates at 4 decimals', () => {
  assert.equal(sameLoc({ lat: 38.670001, lon: -90.370001 }, { lat: 38.67, lon: -90.37 }), true);
  assert.equal(sameLoc({ lat: 38.67, lon: -90.37 }, { lat: 38.68, lon: -90.37 }), false);
});

test('addLocation appends new, dedupes same coords', () => {
  const a = { name: 'A', lat: 1, lon: 2 };
  const b = { name: 'B', lat: 3, lon: 4 };
  const list = addLocation([a], b);
  assert.equal(list.length, 2);
  const dup = addLocation(list, { name: 'A2', lat: 1.00001, lon: 2.00001 });
  assert.equal(dup.length, 2); // deduped
  assert.notEqual(list, [a]); // new array, not mutated in place
});

test('removeLocation removes by rounded coords', () => {
  const a = { name: 'A', lat: 1, lon: 2 };
  const b = { name: 'B', lat: 3, lon: 4 };
  const list = removeLocation([a, b], { lat: 1.00001, lon: 2 });
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'B');
});
