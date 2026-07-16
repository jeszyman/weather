import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyUV, classifyAQI, classifyGust, classifyThermal, classifyPrecip, classifyStorm } from '../uv-core.js';

test('classifyUV bands with exact boundaries', () => {
  assert.equal(classifyUV(0), 'go');
  assert.equal(classifyUV(2.9), 'go');
  assert.equal(classifyUV(3), 'caution');   // exactly 3
  assert.equal(classifyUV(7), 'caution');
  assert.equal(classifyUV(8), 'nogo');      // exactly 8
  assert.equal(classifyUV(11), 'nogo');
});

test('classifyAQI bands with exact boundaries', () => {
  assert.equal(classifyAQI(50), 'go');
  assert.equal(classifyAQI(51), 'caution'); // exactly 51
  assert.equal(classifyAQI(100), 'caution');
  assert.equal(classifyAQI(101), 'nogo');   // exactly 101
});

test('classifyGust bands with exact boundaries', () => {
  assert.equal(classifyGust(19), 'go');
  assert.equal(classifyGust(20), 'caution');
  assert.equal(classifyGust(30), 'caution'); // exactly 30
  assert.equal(classifyGust(31), 'nogo');    // exactly 31
});

test('classifyThermal is bidirectional with exact boundaries', () => {
  assert.equal(classifyThermal(60), 'go');
  assert.equal(classifyThermal(40), 'go');    // exactly 40 -> go
  assert.equal(classifyThermal(84), 'go');
  assert.equal(classifyThermal(85), 'caution'); // exactly 85
  assert.equal(classifyThermal(99), 'caution');
  assert.equal(classifyThermal(100), 'nogo');   // exactly 100
  assert.equal(classifyThermal(39), 'caution');
  assert.equal(classifyThermal(20), 'caution'); // exactly 20
  assert.equal(classifyThermal(19), 'nogo');
  assert.equal(classifyThermal(-5), 'nogo');
});

test('classifyPrecip bands', () => {
  assert.equal(classifyPrecip(0), 'go');
  assert.equal(classifyPrecip(0.05), 'caution');
  assert.equal(classifyPrecip(0.099), 'caution');
  assert.equal(classifyPrecip(0.1), 'nogo');  // exactly 0.1
  assert.equal(classifyPrecip(0.5), 'nogo');
});

test('classifyStorm: code beats CAPE', () => {
  assert.equal(classifyStorm(95, 0), 'nogo');    // storm code wins even at low CAPE
  assert.equal(classifyStorm(96, 5000), 'nogo');
  assert.equal(classifyStorm(99, 0), 'nogo');
  assert.equal(classifyStorm(3, 1500), 'caution'); // high CAPE, no storm code
  assert.equal(classifyStorm(3, 1000), 'caution'); // exactly 1000
  assert.equal(classifyStorm(3, 999), 'go');
  assert.equal(classifyStorm(0, 0), 'go');
});
