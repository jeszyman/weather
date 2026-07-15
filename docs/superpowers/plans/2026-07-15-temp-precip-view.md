# Temperature + Precipitation View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stacked temperature panel, precipitation panel, and hourly table below the existing UV chart, fed by the Open-Meteo forecast endpoint, following the established sibling-function pattern.

**Architecture:** New pure renderers appended to `uv-core.js` (string-returning, Node-tested); a shared `todayIndices` primitive that the existing `filterToday` is refactored onto; an independent `fetchForecast()` + wiring in `index.html`. No build step, no dependencies.

**Tech Stack:** HTML, vanilla ES2020 modules, inline SVG, Open-Meteo forecast API, GitHub Pages, `node --test`.

## Global Constraints

- No build step, no runtime dependencies, no backend.
- Forecast endpoint exactly: `https://api.open-meteo.com/v1/forecast?latitude=38.67&longitude=-90.37&hourly=temperature_2m,precipitation_probability,precipitation&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=auto`
- Location hardcoded 38.67, -90.37. Units °F / % / inch.
- Slice today via `todayIndices(time, todayStr)` + `locationToday(Date.now(), utc_offset_seconds)` — never index `[0:24]`.
- SVG y mapped top-down (inverted). No clipping of any real data point.
- Temp auto-scale: `min=floor(minTemp)-2`, `max=ceil(maxTemp)+2`, then widen symmetrically to a **minimum 10°F span**.
- Precip: probability 0–100% as bars, amount (inch) as an overlaid line on its own scale, with a legend.
- Forecast view fetched INDEPENDENTLY of UV with its own `.err` box — one failing must not blank the other.
- The existing `filterToday` tests must pass unchanged after the refactor (regression guard).

---

### Task 1: Extract `todayIndices`, refactor `filterToday` onto it

**Files:**
- Modify: `~/repos/weather/uv-core.js`
- Test: `~/repos/weather/test/uv-core.test.mjs` (add cases; do NOT change existing `filterToday` cases)

**Interfaces:**
- Produces: `todayIndices(time, todayStr) -> number[]` — indices `i` where `time[i]` is a string starting with `todayStr`.
- Unchanged public behavior: `filterToday(time, uv, uvClear, todayStr)` returns the same output as before, now implemented via `todayIndices`.

- [ ] **Step 1: Write the failing test** (append to `test/uv-core.test.mjs`; add `todayIndices` to the existing import from `../uv-core.js`)

```javascript
test('todayIndices returns indices whose time starts with the date', () => {
  const time = ['2026-07-14T23:00', '2026-07-15T00:00', '2026-07-15T13:00', '2026-07-16T00:00'];
  assert.deepEqual(todayIndices(time, '2026-07-15'), [1, 2]);
  assert.deepEqual(todayIndices(time, '2026-07-14'), [0]);
  assert.deepEqual(todayIndices(time, '2026-07-17'), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/repos/weather && node --test`
Expected: FAIL — `todayIndices` is not exported.

- [ ] **Step 3: Implement and refactor in `uv-core.js`**

Add the primitive and re-base `filterToday` on it (replace the existing `filterToday` body):

```javascript
export function todayIndices(time, todayStr) {
  const out = [];
  for (let i = 0; i < time.length; i++) {
    if (typeof time[i] === 'string' && time[i].startsWith(todayStr)) out.push(i);
  }
  return out;
}

export function filterToday(time, uv, uvClear, todayStr) {
  return todayIndices(time, todayStr).map((i) => ({ time: time[i], uv: uv[i], uvClear: uvClear[i] }));
}
```

- [ ] **Step 4: Run tests to verify all pass (regression guard)**

Run: `cd ~/repos/weather && node --test`
Expected: PASS — all prior tests (including the original `filterToday` cases, unchanged) plus the new `todayIndices` case.

- [ ] **Step 5: Commit**

```bash
cd ~/repos/weather
git add uv-core.js test/uv-core.test.mjs
git commit -m "refactor: extract todayIndices, rebase filterToday on it"
```

---

### Task 2: `buildTempSvg` — temperature line with padded auto-scale

**Files:**
- Modify: `~/repos/weather/uv-core.js`
- Test: `~/repos/weather/test/temp-svg.test.mjs`

**Interfaces:**
- Consumes: nothing from other new tasks (self-contained pure renderer).
- Produces: `buildTempSvg(points, opts?) -> string` where `points` is `Array<{time, temp}>`. `opts` defaults `{width: 720, height: 240, pad: 40}`. Scale: `lo0 = Math.floor(min)-2`, `hi0 = Math.ceil(max)+2`; if `hi0-lo0 < 10`, widen symmetrically to span 10. y top-down: `y = (height-pad) - ((temp-lo)/(hi-lo))*(height-2*pad)`. Draws the temp polyline, x ticks every 3h, y ticks, and high/low labels. Empty `points` returns a valid `<svg>` without throwing.

- [ ] **Step 1: Write the failing tests**

```javascript
// test/temp-svg.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTempSvg } from '../uv-core.js';

const hour = (h, temp) => ({ time: `2026-07-15T${String(h).padStart(2, '0')}:00`, temp });

test('buildTempSvg returns an svg string with one temp polyline', () => {
  const pts = [hour(6, 70), hour(12, 88), hour(18, 79)];
  const svg = buildTempSvg(pts);
  assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
  assert.equal((svg.match(/<polyline/g) || []).length, 1);
});

test('buildTempSvg enforces a minimum 10F span on narrow sub-freezing data (no clip)', () => {
  const pts = [hour(6, 28), hour(12, 34), hour(18, 30)];
  const svg = buildTempSvg(pts, { width: 720, height: 240, pad: 40 });
  const ys = [...svg.matchAll(/(?:^|[ ,])[\d.]+,([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(ys.length > 0);
  assert.ok(Math.min(...ys) >= 40 - 0.001);          // no clip at top
  assert.ok(Math.max(...ys) <= 240 - 40 + 0.001);    // no clip at bottom
});

test('buildTempSvg labels the high and low', () => {
  const svg = buildTempSvg([hour(6, 61), hour(14, 90)]);
  assert.match(svg, /90/);
  assert.match(svg, /61/);
});

test('buildTempSvg with empty points does not throw', () => {
  assert.match(buildTempSvg([]), /^<svg[\s\S]*<\/svg>$/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/repos/weather && node --test`
Expected: FAIL — `buildTempSvg` not exported.

- [ ] **Step 3: Implement `buildTempSvg` in `uv-core.js`**

```javascript
function hourOfDayT(iso) { return Number(iso.slice(11, 13)); }

export function buildTempSvg(points, opts = {}) {
  const { width = 720, height = 240, pad = 40 } = opts;
  const plotW = width - 2 * pad;
  const plotH = height - 2 * pad;
  const temps = points.map((p) => p.temp);
  let lo = points.length ? Math.floor(Math.min(...temps)) - 2 : 0;
  let hi = points.length ? Math.ceil(Math.max(...temps)) + 2 : 10;
  if (hi - lo < 10) { const mid = (hi + lo) / 2; lo = mid - 5; hi = mid + 5; }
  const x = (h) => pad + (h / 23) * plotW;
  const y = (t) => (height - pad) - ((t - lo) / (hi - lo)) * plotH;

  const poly = points.length
    ? `<polyline points="${points.map((p) => `${x(hourOfDayT(p.time)).toFixed(1)},${y(p.temp).toFixed(1)}`).join(' ')}" fill="none" stroke="#e65100" stroke-width="2"/>`
    : '<polyline points="" fill="none" stroke="#e65100"/>';

  let ticks = '';
  for (let h = 0; h <= 23; h += 3) {
    ticks += `<text x="${x(h).toFixed(1)}" y="${height - pad + 16}" font-size="11" text-anchor="middle" fill="#555">${String(h).padStart(2, '0')}</text>`;
  }
  const yStep = Math.max(2, Math.round((hi - lo) / 6));
  for (let v = Math.ceil(lo); v <= hi; v += yStep) {
    ticks += `<text x="${pad - 8}" y="${(y(v) + 4).toFixed(1)}" font-size="11" text-anchor="end" fill="#555">${v}</text>`;
  }

  let labels = '';
  if (points.length) {
    const hiP = points.reduce((a, b) => (b.temp > a.temp ? b : a));
    const loP = points.reduce((a, b) => (b.temp < a.temp ? b : a));
    labels =
      `<circle cx="${x(hourOfDayT(hiP.time)).toFixed(1)}" cy="${y(hiP.temp).toFixed(1)}" r="3" fill="#e65100"/>` +
      `<text x="${x(hourOfDayT(hiP.time)).toFixed(1)}" y="${(y(hiP.temp) - 8).toFixed(1)}" font-size="12" text-anchor="middle" fill="#e65100">high ${Math.round(hiP.temp)}°</text>` +
      `<circle cx="${x(hourOfDayT(loP.time)).toFixed(1)}" cy="${y(loP.temp).toFixed(1)}" r="3" fill="#0277bd"/>` +
      `<text x="${x(hourOfDayT(loP.time)).toFixed(1)}" y="${(y(loP.temp) + 16).toFixed(1)}" font-size="12" text-anchor="middle" fill="#0277bd">low ${Math.round(loP.temp)}°</text>`;
  }

  const axis = `<line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#999"/>` +
               `<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#999"/>`;

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg">${axis}${ticks}${poly}${labels}</svg>`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/repos/weather && node --test`
Expected: PASS — all tests including the four new temp cases.

- [ ] **Step 5: Commit**

```bash
cd ~/repos/weather
git add uv-core.js test/temp-svg.test.mjs
git commit -m "feat: buildTempSvg temperature line with padded auto-scale"
```

---

### Task 3: `buildPrecipSvg` (bars + amount line) and `buildWeatherTable`

**Files:**
- Modify: `~/repos/weather/uv-core.js`
- Test: `~/repos/weather/test/precip.test.mjs`

**Interfaces:**
- Produces:
  - `buildPrecipSvg(points, opts?) -> string`, `points` = `Array<{time, prob, amount}>`. Left axis fixed 0–100% for probability bars; right axis 0..`max(0.1, ceil(maxAmount*10)/10)` for the amount line. Legend text names both series. Empty points → valid `<svg>` without throwing.
  - `buildWeatherTable(points) -> string`, `points` = `Array<{time, temp, prob, amount}>`. Returns an HTML `<table>` with a header row (Hour, °F, Precip %, Precip in) and one row per point. Empty points → a table with just the header.

- [ ] **Step 1: Write the failing tests**

```javascript
// test/precip.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrecipSvg, buildWeatherTable } from '../uv-core.js';

const P = (h, prob, amount) => ({ time: `2026-07-15T${String(h).padStart(2, '0')}:00`, prob, amount });

test('buildPrecipSvg draws one bar per point and an amount polyline', () => {
  const pts = [P(6, 10, 0), P(7, 80, 0.2), P(8, 40, 0.05)];
  const svg = buildPrecipSvg(pts);
  assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
  assert.equal((svg.match(/<rect/g) || []).length >= 3, true);   // >=3 bars (may include legend swatches)
  assert.equal((svg.match(/<polyline/g) || []).length, 1);       // amount line
});

test('buildPrecipSvg probability bars never exceed the plot height (0-100 fixed)', () => {
  const svg = buildPrecipSvg([P(12, 100, 0.5)], { width: 720, height: 200, pad: 40 });
  const heights = [...svg.matchAll(/<rect[^>]*height="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.ok(Math.max(...heights) <= 200 - 2 * 40 + 0.001);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/repos/weather && node --test`
Expected: FAIL — `buildPrecipSvg` / `buildWeatherTable` not exported.

- [ ] **Step 3: Implement both in `uv-core.js`**

```javascript
function hourOfDayP(iso) { return Number(iso.slice(11, 13)); }

export function buildPrecipSvg(points, opts = {}) {
  const { width = 720, height = 200, pad = 40 } = opts;
  const plotW = width - 2 * pad;
  const plotH = height - 2 * pad;
  const x = (h) => pad + (h / 23) * plotW;
  const yProb = (p) => (height - pad) - (Math.max(0, Math.min(100, p)) / 100) * plotH;
  const maxAmt = points.reduce((m, p) => Math.max(m, p.amount || 0), 0);
  const amtTop = Math.max(0.1, Math.ceil(maxAmt * 10) / 10);
  const yAmt = (a) => (height - pad) - (Math.max(0, a) / amtTop) * plotH;

  const barW = Math.max(2, (plotW / 24) * 0.7);
  const bars = points
    .map((p) => {
      const bx = x(hourOfDayP(p.time)) - barW / 2;
      const top = yProb(p.prob);
      return `<rect x="${bx.toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${(height - pad - top).toFixed(1)}" fill="#4fc3f7" opacity="0.6"/>`;
    })
    .join('');

  const amtLine = points.length
    ? `<polyline points="${points.map((p) => `${x(hourOfDayP(p.time)).toFixed(1)},${yAmt(p.amount).toFixed(1)}`).join(' ')}" fill="none" stroke="#01579b" stroke-width="1.5"/>`
    : '<polyline points="" fill="none" stroke="#01579b"/>';

  let ticks = '';
  for (let h = 0; h <= 23; h += 3) {
    ticks += `<text x="${x(h).toFixed(1)}" y="${height - pad + 16}" font-size="11" text-anchor="middle" fill="#555">${String(h).padStart(2, '0')}</text>`;
  }
  for (let p = 0; p <= 100; p += 25) {
    ticks += `<text x="${pad - 8}" y="${(yProb(p) + 4).toFixed(1)}" font-size="10" text-anchor="end" fill="#4fc3f7">${p}%</text>`;
  }
  ticks += `<text x="${width - pad + 6}" y="${(yAmt(amtTop) + 4).toFixed(1)}" font-size="10" text-anchor="start" fill="#01579b">${amtTop}"</text>` +
           `<text x="${width - pad + 6}" y="${(yAmt(0) + 4).toFixed(1)}" font-size="10" text-anchor="start" fill="#01579b">0"</text>`;

  const legend =
    `<rect x="${pad}" y="8" width="10" height="10" fill="#4fc3f7" opacity="0.6"/>` +
    `<text x="${pad + 14}" y="17" font-size="11" fill="#555">prob %</text>` +
    `<line x1="${pad + 70}" y1="13" x2="${pad + 90}" y2="13" stroke="#01579b" stroke-width="1.5"/>` +
    `<text x="${pad + 94}" y="17" font-size="11" fill="#555">amount in</text>`;

  const axis = `<line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#999"/>` +
               `<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#999"/>`;

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg">${axis}${bars}${amtLine}${ticks}${legend}</svg>`;
}

export function buildWeatherTable(points) {
  const head = '<thead><tr><th>Hour</th><th>°F</th><th>Precip %</th><th>Precip in</th></tr></thead>';
  const body = points
    .map((p) => {
      const hh = String(hourOfDayP(p.time)).padStart(2, '0');
      return `<tr><td>${hh}:00</td><td>${Math.round(p.temp)}</td><td>${Math.round(p.prob)}</td><td>${Number(p.amount).toFixed(2)}</td></tr>`;
    })
    .join('');
  return `<table>${head}<tbody>${body}</tbody></table>`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/repos/weather && node --test`
Expected: PASS — all tests including the five new precip/table cases.

- [ ] **Step 5: Commit**

```bash
cd ~/repos/weather
git add uv-core.js test/precip.test.mjs
git commit -m "feat: buildPrecipSvg (bars+amount) and buildWeatherTable"
```

---

### Task 4: Wire the forecast section into `index.html` and deploy

**Files:**
- Modify: `~/repos/weather/index.html`

**Interfaces:**
- Consumes: `todayIndices`, `locationToday` (Task 1), `buildTempSvg` (Task 2), `buildPrecipSvg`, `buildWeatherTable` (Task 3).
- Produces: the extended page. Adds `fetchForecast()` and a `mainForecast()` independent of the existing UV `main()`.

- [ ] **Step 1: Add the forecast section markup**

In `index.html`, add three containers and a small table style. After the existing `#chart` div, insert:

```html
  <h2 style="font-size:1.1rem;margin-top:2rem;">Temperature — Olivette, MO</h2>
  <div id="temp">Loading…</div>
  <h2 style="font-size:1.1rem;margin-top:1.5rem;">Precipitation — Olivette, MO</h2>
  <p class="sub">Bars = chance of rain (%), line = hourly amount (in).</p>
  <div id="precip">Loading…</div>
  <h2 style="font-size:1.1rem;margin-top:1.5rem;">Hourly detail</h2>
  <div id="wtable">Loading…</div>
```

And add to the existing `<style>` block:

```css
    table { border-collapse: collapse; font-size: 0.85rem; width: 100%; }
    th, td { border: 1px solid #eee; padding: 2px 8px; text-align: right; }
    th:first-child, td:first-child { text-align: left; }
```

- [ ] **Step 2: Add the forecast module logic**

In the existing `<script type="module">`, extend the import and add the forecast fetch/wiring. Update the import line to:

```javascript
    import { filterToday, buildSvg, locationToday, todayIndices, buildTempSvg, buildPrecipSvg, buildWeatherTable } from './uv-core.js';
```

Then append, after the existing `main(); ` call:

```javascript
    const FURL = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&hourly=temperature_2m,precipitation_probability,precipitation&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=auto`;

    async function fetchForecast() {
      const res = await fetch(FURL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      const h = j.hourly;
      const ok = h && Array.isArray(h.time) && Array.isArray(h.temperature_2m) &&
        Array.isArray(h.precipitation_probability) && Array.isArray(h.precipitation) &&
        h.temperature_2m.length === h.time.length &&
        h.precipitation_probability.length === h.time.length &&
        h.precipitation.length === h.time.length &&
        typeof j.utc_offset_seconds === 'number';
      if (!ok) throw new Error('malformed response');
      return j;
    }

    async function mainForecast() {
      const tEl = document.getElementById('temp');
      const pEl = document.getElementById('precip');
      const wEl = document.getElementById('wtable');
      try {
        const j = await fetchForecast();
        const h = j.hourly;
        const idx = todayIndices(h.time, locationToday(Date.now(), j.utc_offset_seconds));
        if (!idx.length) { tEl.textContent = pEl.textContent = wEl.textContent = 'No forecast for today yet.'; return; }
        const temp = idx.map((i) => ({ time: h.time[i], temp: h.temperature_2m[i] }));
        const precip = idx.map((i) => ({ time: h.time[i], prob: h.precipitation_probability[i], amount: h.precipitation[i] }));
        const all = idx.map((i) => ({ time: h.time[i], temp: h.temperature_2m[i], prob: h.precipitation_probability[i], amount: h.precipitation[i] }));
        tEl.innerHTML = buildTempSvg(temp);
        pEl.innerHTML = buildPrecipSvg(precip);
        wEl.innerHTML = buildWeatherTable(all);
      } catch (e) {
        console.error(e);
        const msg = `<div class="err">Couldn't load forecast — try again later.</div>`;
        tEl.innerHTML = msg; pEl.innerHTML = ''; wEl.innerHTML = '';
      }
    }
    mainForecast();
```

- [ ] **Step 3: Smoke-serve and verify structure headlessly**

Run:
```bash
cd ~/repos/weather && python3 -m http.server 8099 &
sleep 1
curl -sS -o /dev/null -w 'index=%{http_code}\n' http://localhost:8099/index.html
curl -sS http://localhost:8099/index.html | grep -oE 'id="(temp|precip|wtable)"' | sort -u
kill %1 2>/dev/null
```
Expected: `index=200` and all three ids (`temp`, `precip`, `wtable`) present.

- [ ] **Step 4: Commit**

```bash
cd ~/repos/weather
git add index.html
git commit -m "feat: wire independent forecast section (temp, precip, table)"
```

- [ ] **Step 5: Merge to master and deploy** (controller handles via finishing-a-development-branch)

Fast-forward `master` to this branch, push, confirm Pages rebuilds, and verify the live URL renders both the UV chart and the forecast section. (Pages is already enabled on master root from v1 — no re-enable needed.)

---

## Self-Review

**Spec coverage:** shared `todayIndices` refactor with regression guard (Task 1), `buildTempSvg` padded ≥10°F auto-scale no-clip (Task 2), `buildPrecipSvg` bars+amount+legend and `buildWeatherTable` (Task 3), independent `fetchForecast`/`mainForecast` with own `.err` box + array-alignment validation + page order UV→Temp→Precip→Table (Task 4), live deploy verification (Task 4 Step 5). All spec sections map to a task.

**Placeholder scan:** no TBD/TODO; every code step shows complete code; all tests have concrete assertions.

**Type consistency:** `todayIndices(time, todayStr)->number[]` defined in Task 1, consumed identically in Task 4. `buildTempSvg`/`buildPrecipSvg` take `{time,...}` point objects and are called with exactly those shapes in Task 4. `buildWeatherTable` takes `{time,temp,prob,amount}` — matches the `all` array built in Task 4. `locationToday` reused with the existing `(nowMs, utcOffsetSeconds)` signature.
