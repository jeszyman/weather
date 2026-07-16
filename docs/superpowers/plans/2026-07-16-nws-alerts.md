# NWS Active Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add NOAA/NWS active alerts — a severity-colored banner at the top and a matrix storm-row override where convective warnings force no-go during their window.

**Architecture:** Pure alert helpers + a `renderAlertBanner` helper + a `buildMatrix` storm-override in `uv-core.js` (Node-tested); a non-fatal `fetchAlerts` folded into the existing matrix fetch in `index.html`, under the render-token guard. No build step, no dependencies.

**Tech Stack:** HTML, vanilla ES2020 modules, NWS `api.weather.gov` (keyless, CORS `*`), `node --test`.

## Global Constraints

- No build step, no runtime dependencies, no backend. FOSS + public/government data.
- Alerts endpoint: `https://api.weather.gov/alerts/active?point=<lat>,<lon>`.
- The alerts fetch is NON-FATAL inside the matrix's Promise.all: its failure resolves to no-alerts; the two Open-Meteo legs remain fatal.
- Alert `event`/`headline` are untrusted → DOM only via `createElement`+`setText`, never innerHTML.
- `convectiveHours(alerts, todayStr, offsetSeconds)` maps alert `[onset, ends||expires]` intervals to today's covered HH using the LOCATION's utc offset (same clock the matrix slices by); an hour H is covered iff `onsetMs < startMs+3600000 && endMs > startMs` where `startMs = Date.parse(`${todayStr}T${HH}:00:00Z`) - offsetSeconds*1000`.
- `isConvectiveAlert` requires event containing ("Tornado" OR "Thunderstorm") AND "Warning" (case-insensitive) — watches/advisories do NOT override.
- Matrix storm cell: `stormWarning ? 'nogo' : classifyStorm(code,cape)`; override cells read "…nogo (NWS warning)" in title/aria-label.
- Existing matrix/classifier tests must stay green (regression).

---

### Task 1: Pure alert helpers in `uv-core.js`

**Files:**
- Modify: `~/repos/weather/uv-core.js`
- Test: `~/repos/weather/test/alerts.test.mjs`

**Interfaces:**
- Produces:
  - `parseAlerts(json) -> Array<{event, severity, onset, ends, expires, headline}>` — from `json.features[].properties`; `[]` if `features` absent/not-array; skip entries whose `event` is not a string; missing `severity` → `'Unknown'`.
  - `alertSeverityRank(sev) -> number` — Extreme 4, Severe 3, Moderate 2, Minor 1, else 0.
  - `isConvectiveAlert(event) -> boolean` — `/tornado|thunderstorm/i.test(event) && /warning/i.test(event)`.
  - `convectiveHours(alerts, todayStr, offsetSeconds) -> Set<string>` — per the constraint formula.

- [ ] **Step 1: Write the failing tests**

```javascript
// test/alerts.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAlerts, alertSeverityRank, isConvectiveAlert, convectiveHours } from '../uv-core.js';

test('parseAlerts maps properties and defaults missing severity', () => {
  const json = { features: [
    { properties: { event: 'Severe Thunderstorm Warning', severity: 'Severe', onset: '2026-07-16T13:00:00-05:00', ends: '2026-07-16T14:00:00-05:00', headline: 'x' } },
    { properties: { event: 'Heat Advisory', onset: null, ends: null, headline: 'y' } }, // no severity
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
  assert.equal(set.has('10'), false);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/repos/weather && node --test`
Expected: FAIL — the four helpers are not exported.

- [ ] **Step 3: Implement in `uv-core.js`**

```javascript
export function parseAlerts(json) {
  const feats = json && Array.isArray(json.features) ? json.features : [];
  const out = [];
  for (const f of feats) {
    const p = (f && f.properties) || {};
    if (typeof p.event !== 'string') continue;
    out.push({
      event: p.event,
      severity: typeof p.severity === 'string' ? p.severity : 'Unknown',
      onset: p.onset || null,
      ends: p.ends || null,
      expires: p.expires || null,
      headline: typeof p.headline === 'string' ? p.headline : '',
    });
  }
  return out;
}

export function alertSeverityRank(sev) {
  return { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1 }[sev] || 0;
}

export function isConvectiveAlert(event) {
  return /tornado|thunderstorm/i.test(event) && /warning/i.test(event);
}

export function convectiveHours(alerts, todayStr, offsetSeconds) {
  const covered = new Set();
  for (const a of alerts) {
    if (!isConvectiveAlert(a.event)) continue;
    const onsetMs = Date.parse(a.onset);
    if (Number.isNaN(onsetMs)) continue;
    let endMs = Date.parse(a.ends || a.expires);
    if (Number.isNaN(endMs)) endMs = onsetMs + 3600000;
    for (let h = 0; h < 24; h++) {
      const hh = String(h).padStart(2, '0');
      const startMs = Date.parse(`${todayStr}T${hh}:00:00Z`) - offsetSeconds * 1000;
      const hourEndMs = startMs + 3600000;
      if (onsetMs < hourEndMs && endMs > startMs) covered.add(hh);
    }
  }
  return covered;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/repos/weather && node --test`
Expected: PASS — all prior tests plus the alert cases.

- [ ] **Step 5: Commit**

```bash
cd ~/repos/weather
git add uv-core.js test/alerts.test.mjs
git commit -m "feat: pure NWS alert parse/rank/convective-hours helpers"
```

---

### Task 2: `buildMatrix` storm override + `renderAlertBanner`

**Files:**
- Modify: `~/repos/weather/uv-core.js`
- Test: `~/repos/weather/test/matrix.test.mjs` (extend), `~/repos/weather/test/banner.test.mjs` (new)

**Interfaces:**
- Modified: `buildMatrix(hours)` — the Thunderstorm row uses `h.stormWarning ? 'nogo' : classifyStorm(h.code, h.cape)`; when the override fires, the cell `title`/`aria-label` gains ` (NWS warning)`. Hours without `stormWarning` behave exactly as before.
- Produces: `renderAlertBanner(alerts) -> string` — an HTML string for the banner (a `<div>` per alert, severity class, event name, and time window text), sorted by `alertSeverityRank` desc. Returns `''` for empty input. NOTE: this returns an HTML STRING but every dynamic value (event, window) is built into it via a local escape — see below; the browser-side wiring in Task 3 uses createElement for the untrusted strings. To keep the pure function testable AND safe, `renderAlertBanner` escapes `<>&"'` in `event` and any text via a small `esc()` helper.

- [ ] **Step 1: Write the failing tests**

```javascript
// test/banner.test.mjs
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
```

Add to `test/matrix.test.mjs`:

```javascript
test('buildMatrix stormWarning forces the storm cell to nogo', () => {
  const base = { hour: 14, isDay: 1, uv: 1, aqi: 20, code: 0, cape: 0, gust: 5, appT: 60, precip: 0 };
  const normal = buildMatrix([base]);
  assert.match(normal, /title="Thunderstorm 14:00: go"/); // code0/cape0 -> go normally
  const warned = buildMatrix([{ ...base, stormWarning: true }]);
  assert.match(warned, /title="Thunderstorm 14:00: nogo \(NWS warning\)"/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/repos/weather && node --test`
Expected: FAIL — `renderAlertBanner` missing; the storm-override matrix test fails (no override yet).

- [ ] **Step 3: Implement in `uv-core.js`**

First add a small escaper and the banner:

```javascript
function esc(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}

function alertWindow(onset, ends) {
  const fmt = (iso) => (typeof iso === 'string' && !Number.isNaN(Date.parse(iso)) ? iso.slice(11, 16) : '');
  const a = fmt(onset), b = fmt(ends);
  if (!a && !b) return '';
  return `${a || '?'}–${b || '?'}`;
}

export function renderAlertBanner(alerts) {
  if (!alerts.length) return '';
  const sorted = alerts.slice().sort((x, y) => alertSeverityRank(y.severity) - alertSeverityRank(x.severity));
  const rows = sorted.map((a) => {
    const rank = alertSeverityRank(a.severity);
    const cls = rank >= 3 ? 'sev-high' : rank === 2 ? 'sev-mid' : 'sev-low';
    const win = alertWindow(a.onset, a.ends);
    return `<div class="alert-row ${cls}"><span class="alert-ev">${esc(a.event)}</span>` +
      (win ? `<span class="alert-win">${esc(win)}</span>` : '') + '</div>';
  }).join('');
  return `<div class="alerts">${rows}</div>`;
}
```

Then modify `buildMatrix`'s Thunderstorm row. Change the rows array entry for Thunderstorm so its classifier honors the override, and thread the ` (NWS warning)` suffix into the title/aria-label. Replace the single `fn`-based cell loop with per-row logic that special-cases the storm row:

```javascript
// inside buildMatrix, replace the Thunderstorm row's fn and the cell builder so that:
//   const st = row.label === 'Thunderstorm' && h.stormWarning ? 'nogo' : row.fn(h);
//   const note = row.label === 'Thunderstorm' && h.stormWarning ? ' (NWS warning)' : '';
//   title/aria-label = `${row.label} ${pad(h.hour)}:00: ${st}${note}`
```

Concretely, update the cell-building map in `buildMatrix` to:

```javascript
  const body = rows.map((r) => {
    const cells = hours.map((h) => {
      const override = r.label === 'Thunderstorm' && h.stormWarning === true;
      const st = override ? 'nogo' : r.fn(h);
      const note = override ? ' (NWS warning)' : '';
      const cls = st + (h.isDay === 0 ? ' night' : '');
      const label = `${r.label} ${pad(h.hour)}:00: ${st}${note}`;
      return `<td class="${cls}" title="${label}" aria-label="${label}">${GLYPH[st]}</td>`;
    }).join('');
    return `<tr><th class="rowlabel">${r.label}</th>${cells}</tr>`;
  }).join('');
```

(Keep the existing header row and `rows` definitions; only the `body` cell builder changes to add the override + note. If the file already added `aria-label` in the prior feature, preserve that; this just adds the `note`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/repos/weather && node --test`
Expected: PASS — all tests including the new banner + storm-override cases; existing matrix tests still green.

- [ ] **Step 5: Commit**

```bash
cd ~/repos/weather
git add uv-core.js test/matrix.test.mjs test/banner.test.mjs
git commit -m "feat: matrix storm-warning override + renderAlertBanner (escaped)"
```

---

### Task 3: `fetchAlerts` (non-fatal) + banner wiring in `index.html`

**Files:**
- Modify: `~/repos/weather/index.html`

**Interfaces:**
- Consumes: `parseAlerts`, `convectiveHours`, `renderAlertBanner`, `locationToday` (existing), and the matrix render machinery.
- Produces: alerts folded into `renderMatrix`'s coordinated fetch; a `#alerts` banner region.

- [ ] **Step 1: Add the banner container at the very top of the body**

Immediately after `<body>`'s location bar `</div>` (id `locbar`), BEFORE the `#h-matrix` heading, insert:

```html
  <div id="alerts"></div>
```

Add to the `<style>` block:

```css
    #alerts { margin-bottom: 1rem; }
    .alerts { display: flex; flex-direction: column; gap: 4px; }
    .alert-row { display: flex; justify-content: space-between; gap: 1rem; padding: 6px 10px; border-radius: 4px; font-size: 0.9rem; }
    .alert-row.sev-high { background: #ef9a9a; }
    .alert-row.sev-mid { background: #ffe082; }
    .alert-row.sev-low { background: #e0e0e0; }
    .alert-ev { font-weight: 600; }
```

- [ ] **Step 2: Fold the non-fatal alerts fetch into `renderMatrix`**

Add `parseAlerts, convectiveHours, renderAlertBanner` to the import from `./uv-core.js`. Then modify `fetchMatrix` to also fetch alerts non-fatally, and `renderMatrix` to render the banner + apply the override.

In `fetchMatrix(lat, lon)`, add a third, non-fatal fetch to the Promise.all:

```javascript
    async function fetchMatrix(lat, lon) {
      const aqURL = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=uv_index,us_aqi&timezone=auto`;
      const fcURL = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=cape,weather_code,wind_gusts_10m,apparent_temperature,precipitation,is_day&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto`;
      const alURL = `https://api.weather.gov/alerts/active?point=${lat},${lon}`;
      const [aqRes, fcRes, alJson] = await Promise.all([
        fetch(aqURL),
        fetch(fcURL),
        fetch(alURL).then((r) => (r.ok ? r.json() : null)).catch(() => null), // NON-FATAL
      ]);
      if (!aqRes.ok || !fcRes.ok) throw new Error(`HTTP ${aqRes.status}/${fcRes.status}`);
      const [aq, fc] = await Promise.all([aqRes.json(), fcRes.json()]);
      // ...existing validation of aq/fc (unchanged)...
      if (!aq.hourly || !Array.isArray(aq.hourly.time) || typeof aq.utc_offset_seconds !== 'number') throw new Error('malformed air-quality');
      if (!fc.hourly || !Array.isArray(fc.hourly.time) || typeof fc.utc_offset_seconds !== 'number') throw new Error('malformed forecast');
      // (the array-length checks added in the matrix hardening remain here unchanged)
      return { aq, fc, alerts: parseAlerts(alJson || {}) };
    }
```

In `renderMatrix(loc, token)`, after `const { aq, fc, alerts } = await fetchMatrix(...)` and the token check, compute the override set and render the banner:

```javascript
        const offset = fc.utc_offset_seconds;
        const todayStr = locationToday(Date.now(), offset);
        const warnHours = convectiveHours(alerts, todayStr, offset);
        // banner
        const alertsEl = document.getElementById('alerts');
        alertsEl.innerHTML = renderAlertBanner(alerts); // safe: renderAlertBanner escapes all dynamic text
        // ...existing join loop, but set stormWarning per hour:
        //   in each pushed hours object add: stormWarning: warnHours.has(String(hourNum).padStart(2,'0'))
```

Wire the `stormWarning` field into the existing `hours.push({...})` in the join loop:

```javascript
          hours.push({
            hour: Number(key),
            isDay: fc.hourly.is_day[fi],
            uv: aq.hourly.uv_index[i],
            aqi: aq.hourly.us_aqi[i],
            code: fc.hourly.weather_code[fi],
            cape: fc.hourly.cape[fi],
            gust: fc.hourly.wind_gusts_10m[fi],
            appT: fc.hourly.apparent_temperature[fi],
            precip: fc.hourly.precipitation[fi],
            stormWarning: warnHours.has(key),
          });
```

(`key` is already the 2-digit HH string in the join loop.) On the matrix error path, also clear the banner: in the `catch`, add `const a = document.getElementById('alerts'); if (a) a.innerHTML = '';` so a stale banner doesn't persist under an errored matrix.

Note on safety: `renderAlertBanner` returns an escaped HTML string (all dynamic text passed through `esc`), so assigning it via `innerHTML` is safe — this is the one banner exception, and it is defense-verified by the Task 2 XSS test. (The rest of the app's untrusted strings still use setText.)

- [ ] **Step 3: Smoke-serve and verify structure headlessly**

Run:
```bash
cd ~/repos/weather && python3 -m http.server 8099 &
sleep 1
curl -sS -o /dev/null -w 'index=%{http_code}\n' http://localhost:8099/index.html
curl -sS http://localhost:8099/index.html | grep -oE 'id="alerts"|api.weather.gov/alerts/active' | sort -u
kill %1 2>/dev/null
```
Expected: `index=200`, `id="alerts"` present, and the alerts endpoint referenced.

- [ ] **Step 4: Commit**

```bash
cd ~/repos/weather
git add index.html
git commit -m "feat: non-fatal NWS alerts fetch -> banner + storm-row override"
```

---

### Task 4: Merge to master and deploy + live verification

**Files:** none (deploy).

- [ ] **Step 1: Controller handles merge via finishing-a-development-branch** (fast-forward master, push; Pages already on master root).

- [ ] **Step 2: Verify live** at `https://jeszyman.github.io/weather/`:
- Page loads; in fair weather the `#alerts` region is empty (no banner) and the matrix renders normally (storm row on its CAPE proxy).
- Controller validates the alerts fetch shape + CORS against the live endpoint, and validates the banner + override against a fabricated fixture (since a live warning may not be active).
- Simulated NWS failure (bad alerts URL): matrix still renders, no banner — confirming the non-fatal design.

---

## Self-Review

**Spec coverage:** pure `parseAlerts`/`alertSeverityRank`/`isConvectiveAlert`/`convectiveHours` with timezone-exact HH bucketing, midnight-spanning, entirely-tomorrow, null-ends (Task 1); `buildMatrix` storm override with `(NWS warning)` note + `renderAlertBanner` escaped/sorted (Task 2); non-fatal third fetch in Promise.all, banner render, `stormWarning` wired into the join, banner cleared on matrix error (Task 3); deploy + live/fixture verification (Task 4). All spec sections map to a task.

**Placeholder scan:** no TBD/TODO; complete code in every step; concrete assertions incl. the exact HH-bucketing fixture.

**Type consistency:** `parseAlerts` → `{event,severity,onset,ends,expires,headline}`; `convectiveHours` reads `event/onset/ends/expires`; `renderAlertBanner` reads `event/severity/onset/ends`. `buildMatrix` reads the new optional `stormWarning` on hour objects; `renderMatrix` sets it from `warnHours.has(key)`. `fetchMatrix` returns `{aq, fc, alerts}`; `renderMatrix` destructures all three. Import list extended with the three new names.
