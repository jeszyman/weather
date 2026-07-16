import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAlertBanner } from '../uv-core.js';

test('renderAlertBanner empty -> empty string', () => {
  assert.equal(renderAlertBanner([]), '');
});

test('renderAlertBanner sorts most-severe-first and shows event names', () => {
  const html = renderAlertBanner([
    { event: 'Heat Advisory', severity: 'Minor', onset: null, ends: null },
    { event: 'Tornado Warning', severity: 'Extreme', onset: null, ends: null },
  ]);
  assert.ok(html.indexOf('Tornado Warning') < html.indexOf('Heat Advisory'));
});

test('renderAlertBanner escapes markup in event text (XSS)', () => {
  const html = renderAlertBanner([{ event: '<img src=x onerror=alert(1)>', severity: 'Severe', onset: null, ends: null }]);
  assert.ok(!html.includes('<img'));
  assert.match(html, /&lt;img/);
});
