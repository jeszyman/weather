# Conditions Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-of-page outdoor-workout conditions matrix (metrics × today's 24 hours, 3-tier traffic-light cells) fed by both Open-Meteo endpoints.

**Architecture:** Six pure classifiers + a pure `buildMatrix` HTML-table renderer in `uv-core.js` (Node-tested); a `fetchMatrix(lat,lon)` (both endpoints via Promise.all, sliced to today, joined per hour) and `renderMatrix` wired into `index.html` under the existing render-token guard. No build step, no dependencies.

**Tech Stack:** HTML, vanilla ES2020 modules, Open-Meteo air-quality + forecast APIs, `node --test`.

## Global Constraints

- No build step, no runtime dependencies, no backend.
- Classifiers each return exactly one of `'go' | 'caution' | 'nogo'`; bands are half-open and contiguous (no gaps/overlaps at exact boundary values).
- Boundary rules (exact values): UV 3→caution, 8→nogo; AQI 51→caution, 101→nogo; gust 30→caution, 31→nogo; thermal 20→caution, 40→go, 85→caution, 100→nogo; precip 0→go, 0.1→nogo; storm code∈{95,96,99}→nogo regardless of CAPE, else CAPE≥1000→caution, else go.
- Matrix slices today via `todayIndices` + `locationToday`; renders under the monotonic `renderToken` guard; its own error box.
- If EITHER endpoint fails, the whole matrix errors (all-metrics judgment).
- Cells numeric, row labels static — no untrusted string in markup. Cells carry a colorblind-safe glyph (`·`/`–`/`✕`) + a `title`; night columns get a `night` class; table in an `overflow-x:auto` container.
- Metric row order: UV, Air quality, Thunderstorm, Thermal, Wind gusts, Precip.

---

### Task 1: Six pure classifiers in `uv-core.js`

**Files:**
- Modify: `~/repos/weather/uv-core.js`
- Test: `~/repos/weather/test/classify.test.mjs`

**Interfaces:**
- Produces (each `-> 'go'|'caution'|'nogo'`):
  - `classifyUV(uv)`, `classifyAQI(aqi)`, `classifyGust(g)`, `classifyThermal(appT)`, `classifyPrecip(p)`, `classifyStorm(code, cape)`.

- [ ] **Step 1: Write the failing tests**

```javascript
// test/classify.test.mjs
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/repos/weather && node --test`
Expected: FAIL — classifiers not exported.

- [ ] **Step 3: Implement in `uv-core.js`**

```javascript
export function classifyUV(uv) { return uv < 3 ? 'go' : uv < 8 ? 'caution' : 'nogo'; }
export function classifyAQI(aqi) { return aqi < 51 ? 'go' : aqi < 101 ? 'caution' : 'nogo'; }
export function classifyGust(g) { return g < 20 ? 'go' : g < 31 ? 'caution' : 'nogo'; }
export function classifyThermal(t) {
  if (t < 20 || t >= 100) return 'nogo';
  if (t < 40 || t >= 85) return 'caution';
  return 'go';
}
export function classifyPrecip(p) { return p <= 0 ? 'go' : p < 0.1 ? 'caution' : 'nogo'; }
export function classifyStorm(code, cape) {
  if (code === 95 || code === 96 || code === 99) return 'nogo';
  if (cape >= 1000) return 'caution';
  return 'go';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/repos/weather && node --test`
Expected: PASS — all prior tests plus the six classifier cases.

- [ ] **Step 5: Commit**

```bash
cd ~/repos/weather
git add uv-core.js test/classify.test.mjs
git commit -m "feat: six pure go/caution/nogo condition classifiers"
```

---

### Task 2: `buildMatrix` renderer (pure HTML-table string)

**Files:**
- Modify: `~/repos/weather/uv-core.js`
- Test: `~/repos/weather/test/matrix.test.mjs`

**Interfaces:**
- Consumes: the six classifiers (Task 1).
- Produces: `buildMatrix(hours) -> string`. `hours` = array of `{hour, isDay, uv, aqi, code, cape, gust, appT, precip}`. Returns an HTML `<table>`: a header row (metric-label column + one `<th>` per hour `00..23`), then six metric rows in fixed order. Each data cell: `class="<state>"` (+ ` night` when `isDay===0`), a glyph (`·` go / `–` caution / `✕` nogo), and a `title` attribute `"<Metric> <HH>:00: <state>"`. Empty `hours` → valid `<table>` with header + six label-only rows, no throw.

- [ ] **Step 1: Write the failing tests**

```javascript
// test/matrix.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMatrix } from '../uv-core.js';

const hr = (over = {}) => ({ hour: 13, isDay: 1, uv: 1, aqi: 20, code: 0, cape: 0, gust: 5, appT: 60, precip: 0, ...over });

test('buildMatrix returns a table with a header and six metric rows', () => {
  const html = buildMatrix([hr()]);
  assert.match(html, /^<table[\s\S]*<\/table>$/);
  // 1 header row + 6 metric rows
  assert.equal((html.match(/<tr/g) || []).length, 7);
  for (const label of ['UV', 'Air quality', 'Thunderstorm', 'Thermal', 'Wind gusts', 'Precip']) {
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

test('buildMatrix storm row uses code-beats-cape', () => {
  const html = buildMatrix([hr({ hour: 14, code: 95, cape: 0 })]);
  assert.match(html, /title="Thunderstorm 14:00: nogo"/);
});

test('buildMatrix empty hours does not throw', () => {
  const html = buildMatrix([]);
  assert.match(html, /^<table[\s\S]*<\/table>$/);
  assert.equal((html.match(/<tr/g) || []).length, 7); // header + 6 label rows, no data cells
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/repos/weather && node --test`
Expected: FAIL — `buildMatrix` not exported.

- [ ] **Step 3: Implement in `uv-core.js`**

```javascript
const GLYPH = { go: '·', caution: '–', nogo: '✕' };

export function buildMatrix(hours) {
  const rows = [
    { label: 'UV', fn: (h) => classifyUV(h.uv) },
    { label: 'Air quality', fn: (h) => classifyAQI(h.aqi) },
    { label: 'Thunderstorm', fn: (h) => classifyStorm(h.code, h.cape) },
    { label: 'Thermal', fn: (h) => classifyThermal(h.appT) },
    { label: 'Wind gusts', fn: (h) => classifyGust(h.gust) },
    { label: 'Precip', fn: (h) => classifyPrecip(h.precip) },
  ];
  const pad = (n) => String(n).padStart(2, '0');
  const head = '<tr><th class="rowlabel">Metric</th>' +
    hours.map((h) => `<th>${pad(h.hour)}</th>`).join('') + '</tr>';
  const body = rows.map((r) => {
    const cells = hours.map((h) => {
      const st = r.fn(h);
      const cls = st + (h.isDay === 0 ? ' night' : '');
      return `<td class="${cls}" title="${r.label} ${pad(h.hour)}:00: ${st}">${GLYPH[st]}</td>`;
    }).join('');
    return `<tr><th class="rowlabel">${r.label}</th>${cells}</tr>`;
  }).join('');
  return `<table class="matrix">${head}${body}</table>`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/repos/weather && node --test`
Expected: PASS — all tests including the five matrix cases.

- [ ] **Step 5: Commit**

```bash
cd ~/repos/weather
git add uv-core.js test/matrix.test.mjs
git commit -m "feat: buildMatrix conditions table with glyphs + night shading"
```

---

### Task 3: `fetchMatrix` + `renderMatrix` wired into `index.html`

**Files:**
- Modify: `~/repos/weather/index.html`

**Interfaces:**
- Consumes: `buildMatrix`, `todayIndices`, `locationToday` (existing), and the render-token machinery from the multi-location work.
- Produces: `fetchMatrix(lat, lon)` and `renderMatrix(loc, token)`, called from `renderAll()` first.

- [ ] **Step 1: Add the matrix container at the TOP of the body**

Immediately after the location bar `</div>` (id `locbar`) and BEFORE the UV `<h1>`, insert:

```html
  <h2 id="h-matrix" data-metric="Conditions" style="font-size:1.1rem;">Conditions</h2>
  <div class="matrix-legend">
    <span><b>·</b> go</span> <span><b>–</b> caution</span> <span><b>✕</b> no-go</span>
    <span class="sub">shaded = night</span>
  </div>
  <div id="matrix-wrap"><div id="matrix">Loading…</div></div>
```

Add to the `<style>` block:

```css
    #matrix-wrap { overflow-x: auto; margin-bottom: 1.5rem; }
    table.matrix { border-collapse: collapse; font-size: 0.8rem; }
    table.matrix th, table.matrix td { border: 1px solid #eee; width: 22px; height: 22px; text-align: center; padding: 0; }
    table.matrix th.rowlabel { position: sticky; left: 0; background: #fff; text-align: left; padding: 0 8px; white-space: nowrap; width: auto; z-index: 1; }
    table.matrix td.go { background: #c8e6c9; }
    table.matrix td.caution { background: #ffe082; }
    table.matrix td.nogo { background: #ef9a9a; }
    table.matrix td.night { box-shadow: inset 0 0 0 99px rgba(30,30,60,0.28); }
    .matrix-legend { font-size: 0.8rem; display: flex; gap: 0.75rem; margin-bottom: 0.4rem; align-items: center; }
```

Also add `h-matrix` to the heading update loop in `updateHeadings` (so its
`— <location>` suffix tracks the active location like the others): change the
loop's id list to include `'h-matrix'`.

- [ ] **Step 2: Add `fetchMatrix` + `renderMatrix` and call it from `renderAll`**

Add `buildMatrix` to the import from `./uv-core.js`. Then add these functions in the module (near the other render functions):

```javascript
    async function fetchMatrix(lat, lon) {
      const aqURL = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=uv_index,us_aqi&timezone=auto`;
      const fcURL = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=cape,weather_code,wind_gusts_10m,apparent_temperature,precipitation,is_day&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto`;
      const [aqRes, fcRes] = await Promise.all([fetch(aqURL), fetch(fcURL)]);
      if (!aqRes.ok || !fcRes.ok) throw new Error(`HTTP ${aqRes.status}/${fcRes.status}`);
      const [aq, fc] = await Promise.all([aqRes.json(), fcRes.json()]);
      if (!aq.hourly || !Array.isArray(aq.hourly.time) || typeof aq.utc_offset_seconds !== 'number') throw new Error('malformed air-quality');
      if (!fc.hourly || !Array.isArray(fc.hourly.time) || typeof fc.utc_offset_seconds !== 'number') throw new Error('malformed forecast');
      return { aq, fc };
    }

    async function renderMatrix(loc, token) {
      const el = document.getElementById('matrix');
      try {
        const { aq, fc } = await fetchMatrix(loc.lat, loc.lon);
        if (token !== renderToken) return;
        const aqIdx = todayIndices(aq.hourly.time, locationToday(Date.now(), aq.utc_offset_seconds));
        const fcIdx = todayIndices(fc.hourly.time, locationToday(Date.now(), fc.utc_offset_seconds));
        // Align by hour-of-day: build a lookup from the forecast slice keyed by HH.
        const hh = (iso) => iso.slice(11, 13);
        const fcByHour = {};
        for (const i of fcIdx) fcByHour[hh(fc.hourly.time[i])] = i;
        const hours = [];
        for (const i of aqIdx) {
          const key = hh(aq.hourly.time[i]);
          const fi = fcByHour[key];
          if (fi === undefined) continue;
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
          });
        }
        if (!hours.length) { el.textContent = 'No conditions data for today yet.'; return; }
        el.innerHTML = buildMatrix(hours);
      } catch (e) {
        if (token !== renderToken) return;
        console.error(e);
        el.innerHTML = `<div class="err">Couldn't load conditions — try again later.</div>`;
      }
    }
```

Then in `renderAll()`, call `renderMatrix(loc, token)` FIRST (before `renderUV`/`renderForecast`):

```javascript
    function renderAll() {
      const token = ++renderToken;
      const loc = active();
      updateHeadings(loc);
      renderMatrix(loc, token);
      renderUV(loc, token);
      renderForecast(loc, token);
    }
```

- [ ] **Step 3: Smoke-serve and verify structure headlessly**

Run:
```bash
cd ~/repos/weather && python3 -m http.server 8099 &
sleep 1
curl -sS -o /dev/null -w 'index=%{http_code}\n' http://localhost:8099/index.html
curl -sS http://localhost:8099/index.html | grep -oE 'id="(matrix|matrix-wrap|h-matrix)"' | sort -u
kill %1 2>/dev/null
```
Expected: `index=200` and all three ids present.

- [ ] **Step 4: Commit**

```bash
cd ~/repos/weather
git add index.html
git commit -m "feat: fetchMatrix (both endpoints) + renderMatrix at top under token guard"
```

---

### Task 4: Merge to master and deploy + live verification

**Files:** none (deploy).

- [ ] **Step 1: Controller handles merge via finishing-a-development-branch** (fast-forward master, push; Pages already on master root).

- [ ] **Step 2: Verify live** at `https://jeszyman.github.io/weather/`:
- Matrix renders at the top: 6 metric rows × 24 hour columns, colored cells with glyphs, a legend, night columns shaded.
- Horizontal scroll works on a narrow viewport; the metric-name column stays sticky.
- Switching location re-renders the matrix (token guard, heading suffix updates).
- Partial-failure check (controller, headless): confirm the join logic against live data for the active location — 24 joined hours, thunderstorm row reflects today's CAPE.

---

## Self-Review

**Spec coverage:** six classifiers with exact-boundary bands (Task 1); `buildMatrix` table with fixed row order, night class, glyphs, titles, empty-safe (Task 2); `fetchMatrix` both-endpoints-Promise.all with whole-matrix-errors-on-either-failure, hour-of-day join, `renderMatrix` under token guard at top of `renderAll`, legend + sticky + overflow-x styles, heading tracks location (Task 3); deploy + live join verification (Task 4). All spec sections map to a task.

**Placeholder scan:** no TBD/TODO; complete code in every step; concrete boundary assertions.

**Type consistency:** classifiers take single numbers and return `'go'|'caution'|'nogo'`; `buildMatrix` calls each with the matching `hours[]` field; `renderMatrix` builds `hours` objects with exactly the fields `buildMatrix` reads (`hour,isDay,uv,aqi,code,cape,gust,appT,precip`). `renderMatrix(loc, token)` matches the `renderUV`/`renderForecast(loc, token)` signature and the token-guard-after-await pattern. `buildMatrix` import added alongside existing `./uv-core.js` names.
