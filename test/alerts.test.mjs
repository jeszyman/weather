import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAlerts, alertSeverityRank, isConvectiveAlert, convectiveHours } from '../uv-core.js';

test('parseAlerts maps properties and defaults missing severity', () => {
  const json = { features: [
    { properties: { event: 'Severe Thunderstorm Warning', severity: 'Severe', onset: '2026-07-16T13:00:00-05:00', ends: '2026-07-16T14:00:00-05:00' } },
    { properties: { event: 'Heat Advisory', onset: null, ends: null } }, // no severity
  ] };
  const out = parseAlerts(json);
  assert.equal(out.length, 2);
  assert.equal(out[0].event, 'Severe Thunderstorm Warning');
  assert.equal(out[1].severity, 'Unknown');
});

test('parseAlerts returns [] when features absent, skips no-event entries', () => {
  assert.deepEqual(parseAlerts({}), []);
  assert.deepEqual(parseAlerts({ features: 'x' }), []);
  assert.deepEqual(parseAlerts({ features: [{ properties: { severity: 'Severe' } }] }), []);
});

test('alertSeverityRank orders severities', () => {
  assert.ok(alertSeverityRank('Extreme') > alertSeverityRank('Severe'));
  assert.ok(alertSeverityRank('Severe') > alertSeverityRank('Moderate'));
  assert.ok(alertSeverityRank('Moderate') > alertSeverityRank('Minor'));
  assert.equal(alertSeverityRank('Whatever'), 0);
});

test('isConvectiveAlert only true for tornado/thunderstorm WARNINGS', () => {
  assert.equal(isConvectiveAlert('Tornado Warning'), true);
  assert.equal(isConvectiveAlert('Severe Thunderstorm Warning'), true);
  assert.equal(isConvectiveAlert('Severe Thunderstorm Watch'), false);
  assert.equal(isConvectiveAlert('Tornado Watch'), false);
  assert.equal(isConvectiveAlert('Heat Advisory'), false);
});

test('convectiveHours buckets an interval into overlapping today hours (UTC offset -5)', () => {
  // offset -5h (CDT). Alert onset 13:20 local, ends 14:40 local -> covers 13 and 14.
  const alerts = [{ event: 'Severe Thunderstorm Warning', onset: '2026-07-16T13:20:00-05:00', ends: '2026-07-16T14:40:00-05:00' }];
  const set = convectiveHours(alerts, '2026-07-16', -5 * 3600);
  assert.equal(set.has('13'), true);
  assert.equal(set.has('14'), true);
  assert.equal(set.has('12'), false);
  assert.equal(set.has('15'), false);
});

test('convectiveHours: entirely-tomorrow alert covers nothing today', () => {
  const alerts = [{ event: 'Tornado Warning', onset: '2026-07-17T10:00:00-05:00', ends: '2026-07-17T11:00:00-05:00' }];
  assert.equal(convectiveHours(alerts, '2026-07-16', -5 * 3600).size, 0);
});

test('convectiveHours: null ends defaults to a 1h window from onset', () => {
  const alerts = [{ event: 'Tornado Warning', onset: '2026-07-16T09:10:00-05:00', ends: null }];
  const set = convectiveHours(alerts, '2026-07-16', -5 * 3600);
  assert.equal(set.has('09'), true);
  assert.equal(set.has('10'), true);
});

test('convectiveHours ignores non-convective and spanning-midnight tail', () => {
  const alerts = [
    { event: 'Heat Advisory', onset: '2026-07-16T12:00:00-05:00', ends: '2026-07-16T20:00:00-05:00' }, // not convective
    { event: 'Tornado Warning', onset: '2026-07-15T23:30:00-05:00', ends: '2026-07-16T00:30:00-05:00' }, // spans into today
  ];
  const set = convectiveHours(alerts, '2026-07-16', -5 * 3600);
  assert.equal(set.has('00'), true);  // today's 00 hour covered by the spanning warning
  assert.equal(set.has('12'), false); // heat advisory does not count
});
