# Hourly UV Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public static web page that renders today's hourly UV index for Olivette, MO from the Open-Meteo air-quality API as hand-built inline SVG.

**Architecture:** One static `index.html` with vanilla JS, no build step and no dependencies. Pure data-shaping functions (filter to today, zip, scale, find peak) are separated from the browser-only fetch and SVG DOM code so they can be unit-tested in Node. Deployed via GitHub Pages.

**Tech Stack:** HTML, vanilla ES2020 JavaScript, inline SVG, Open-Meteo Air Quality API, GitHub Pages. Node.js is used only as a test runner for the pure functions (via the built-in `node:test` module — no npm install).

## Global Constraints

- No build step, no runtime dependencies, no backend. `index.html` is served as-is.
- No API key; single client-side fetch to Open-Meteo.
- Endpoint: `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=38.67&longitude=-90.37&hourly=uv_index,uv_index_clear_sky&timezone=auto`
- Location hardcoded to 38.67, -90.37 (Olivette, MO). UV is the only view in v1.
- Slice today's hours by matching the local date string against `hourly.time[]` — never by index `[0:24]`.
- SVG y-axis ceiling = `Math.max(11, Math.ceil(maxUV))`; y is mapped top-down (inverted).
- WHO UV risk bands: 0–2 low, 3–5 moderate, 6–7 high, 8–10 very high, 11+ extreme.

**Testability note:** Pure functions live in a `<script>` block but are also written to a sibling `uv-core.js` that is `export`ed for Node tests AND loaded by `index.html` via `<script type="module">`. This keeps one source of truth for the logic. The browser-only code (fetch, DOM/SVG creation) stays in `index.html` and is verified manually in the browser.

---

### Task 1: Repo scaffold and pure data-core module

**Files:**
- Create: `~/repos/weather/uv-core.js`
- Test: `~/repos/weather/test/uv-core.test.mjs`
- Create: `~/repos/weather/.gitignore`

**Interfaces:**
- Produces:
  - `filterToday(time, uv, uvClear, todayStr) -> Array<{time, uv, uvClear}>` — keeps entries whose ISO `time` starts with `todayStr` (`"YYYY-MM-DD"`), zipping the three parallel arrays.
  - `computeCeiling(points) -> number` — `Math.max(11, Math.ceil(maxUv))` over `points[].uv`.
  - `findPeak(points) -> {uv, time}` — the point with the highest `uv` (first on ties).
  - `WHO_BANDS -> Array<{min, max, label, color}>` — the five risk bands.

- [ ] **Step 1: Write the failing tests**

```javascript
// test/uv-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterToday, computeCeiling, findPeak, WHO_BANDS } from '../uv-core.js';

test('filterToday keeps only matching local date and zips arrays', () => {
  const time = ['2026-07-13T23:00', '2026-07-14T00:00', '2026-07-14T13:00', '2026-07-15T00:00'];
  const uv = [0, 1, 8, 2];
  const uvClear = [0, 1, 9, 2];
  const out = filterToday(time, uv, uvClear, '2026-07-14');
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { time: '2026-07-14T00:00', uv: 1, uvClear: 1 });
  assert.deepEqual(out[1], { time: '2026-07-14T13:00', uv: 8, uvClear: 9 });
});

test('computeCeiling floors at 11 and rounds up above it', () => {
  assert.equal(computeCeiling([{ uv: 3 }, { uv: 7 }]), 11);
  assert.equal(computeCeiling([{ uv: 11.2 }]), 12);
  assert.equal(computeCeiling([]), 11);
});

test('findPeak returns highest uv and its time, first on ties', () => {
  const pts = [{ time: 'a', uv: 2 }, { time: 'b', uv: 8 }, { time: 'c', uv: 8 }];
  assert.deepEqual(findPeak(pts), { uv: 8, time: 'b' });
});

test('WHO_BANDS covers 0..12 contiguously', () => {
  assert.equal(WHO_BANDS[0].min, 0);
  assert.equal(WHO_BANDS.at(-1).max >= 11, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/repos/weather && node --test`
Expected: FAIL — `Cannot find module '../uv-core.js'` / functions undefined.

- [ ] **Step 3: Write minimal implementation**

```javascript
// uv-core.js
export const WHO_BANDS = [
  { min: 0,  max: 3,   label: 'Low',       color: '#a8e05f' },
  { min: 3,  max: 6,   label: 'Moderate',  color: '#fdd835' },
  { min: 6,  max: 8,   label: 'High',      color: '#ff9800' },
  { min: 8,  max: 11,  label: 'Very high', color: '#f44336' },
  { min: 11, max: 100, label: 'Extreme',   color: '#9c27b0' },
];

export function filterToday(time, uv, uvClear, todayStr) {
  const out = [];
  for (let i = 0; i < time.length; i++) {
    if (typeof time[i] === 'string' && time[i].startsWith(todayStr)) {
      out.push({ time: time[i], uv: uv[i], uvClear: uvClear[i] });
    }
  }
  return out;
}

export function computeCeiling(points) {
  const maxUv = points.reduce((m, p) => Math.max(m, p.uv ?? 0), 0);
  return Math.max(11, Math.ceil(maxUv));
}

export function findPeak(points) {
  return points.reduce(
    (best, p) => (p.uv > best.uv ? { uv: p.uv, time: p.time } : best),
    { uv: -Infinity, time: null }
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/repos/weather && node --test`
Expected: PASS — 4 tests.

- [ ] **Step 5: Add .gitignore and commit**

```bash
cd ~/repos/weather
printf 'node_modules/\n' > .gitignore
git add uv-core.js test/uv-core.test.mjs .gitignore
git commit -m "feat: UV data-core pure functions with node tests"
```

---

### Task 2: SVG builder (pure string function)

Rendering is done as a pure function that returns an SVG markup string, so it is unit-testable in Node and simply injected via `innerHTML` in the browser. This avoids DOM-only APIs and makes the visual logic reviewable.

**Files:**
- Modify: `~/repos/weather/uv-core.js`
- Test: `~/repos/weather/test/uv-svg.test.mjs`

**Interfaces:**
- Consumes: `filterToday`, `computeCeiling`, `findPeak`, `WHO_BANDS` (Task 1).
- Produces:
  - `buildSvg(points, opts?) -> string` — returns an `<svg>...</svg>` string. `opts` defaults: `{width: 720, height: 320, pad: 40}`. Maps `x = pad + (hourOfDay/23)*(width-2*pad)`, `y = (height-pad) - (uv/ceiling)*(height-2*pad)` (inverted). Draws WHO band rects, a solid `uv` polyline, a dashed `uvClear` polyline, axis ticks every 3h, and a peak text label.

- [ ] **Step 1: Write the failing tests**

```javascript
// test/uv-svg.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSvg } from '../uv-core.js';

const pts = [
  { time: '2026-07-14T06:00', uv: 1, uvClear: 1 },
  { time: '2026-07-14T13:00', uv: 8, uvClear: 9 },
  { time: '2026-07-14T20:00', uv: 0, uvClear: 0 },
];

test('buildSvg returns an svg element string with both series', () => {
  const svg = buildSvg(pts);
  assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
  const polylines = svg.match(/<polyline/g) || [];
  assert.equal(polylines.length, 2); // uv + uvClear
});

test('buildSvg never emits y above the plot ceiling (no clipping at UV 8)', () => {
  const svg = buildSvg(pts, { width: 720, height: 320, pad: 40 });
  // ceiling is 11 here; the UV=8 point y must sit within [pad, height-pad]
  const ys = [...svg.matchAll(/(?:^|[ ,])[\d.]+,([\d.]+)/g)].map(m => Number(m[1]));
  assert.ok(ys.length > 0);
  assert.ok(Math.min(...ys) >= 40 - 0.001);
  assert.ok(Math.max(...ys) <= 320 - 40 + 0.001);
});

test('buildSvg labels the peak UV value', () => {
  assert.match(buildSvg(pts), /8/);
});

test('buildSvg with empty points returns svg without throwing', () => {
  assert.match(buildSvg([]), /^<svg[\s\S]*<\/svg>$/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/repos/weather && node --test`
Expected: FAIL — `buildSvg` is not exported.

- [ ] **Step 3: Implement `buildSvg` in `uv-core.js`**

```javascript
// append to uv-core.js
function hourOfDay(iso) { return Number(iso.slice(11, 13)); }

export function buildSvg(points, opts = {}) {
  const { width = 720, height = 320, pad = 40 } = opts;
  const plotW = width - 2 * pad;
  const plotH = height - 2 * pad;
  const ceiling = computeCeiling(points);
  const x = (h) => pad + (h / 23) * plotW;
  const y = (uv) => (height - pad) - (Math.max(0, uv) / ceiling) * plotH;

  // WHO band background rects, clipped to plot ceiling
  const bands = WHO_BANDS
    .filter((b) => b.min < ceiling)
    .map((b) => {
      const top = y(Math.min(b.max, ceiling));
      const bot = y(b.min);
      return `<rect x="${pad}" y="${top.toFixed(1)}" width="${plotW}" height="${(bot - top).toFixed(1)}" fill="${b.color}" opacity="0.15"/>`;
    })
    .join('');

  const toPoly = (key) =>
    points.map((p) => `${x(hourOfDay(p.time)).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');

  const uvLine = points.length
    ? `<polyline points="${toPoly('uv')}" fill="none" stroke="#c62828" stroke-width="2"/>`
    : '<polyline points="" fill="none" stroke="#c62828"/>';
  const clearLine = points.length
    ? `<polyline points="${toPoly('uvClear')}" fill="none" stroke="#7e57c2" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.7"/>`
    : '<polyline points="" fill="none" stroke="#7e57c2"/>';

  // x ticks every 3h
  let ticks = '';
  for (let h = 0; h <= 23; h += 3) {
    ticks += `<text x="${x(h).toFixed(1)}" y="${height - pad + 16}" font-size="11" text-anchor="middle" fill="#555">${String(h).padStart(2, '0')}</text>`;
  }
  // y ticks
  for (let v = 0; v <= ceiling; v += Math.max(1, Math.round(ceiling / 6))) {
    ticks += `<text x="${pad - 8}" y="${(y(v) + 4).toFixed(1)}" font-size="11" text-anchor="end" fill="#555">${v}</text>`;
  }

  let peakLabel = '';
  if (points.length) {
    const pk = findPeak(points);
    const px = x(hourOfDay(pk.time));
    peakLabel = `<circle cx="${px.toFixed(1)}" cy="${y(pk.uv).toFixed(1)}" r="3" fill="#c62828"/>` +
      `<text x="${px.toFixed(1)}" y="${(y(pk.uv) - 8).toFixed(1)}" font-size="12" text-anchor="middle" fill="#c62828">peak ${pk.uv} @ ${hourOfDay(pk.time)}:00</text>`;
  }

  const axis = `<line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#999"/>` +
               `<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#999"/>`;

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg">${bands}${axis}${ticks}${clearLine}${uvLine}${peakLabel}</svg>`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/repos/weather && node --test`
Expected: PASS — all Task 1 + Task 2 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/repos/weather
git add uv-core.js test/uv-svg.test.mjs
git commit -m "feat: pure SVG builder for hourly UV with WHO bands"
```

---

### Task 3: index.html — fetch, wire, error handling

**Files:**
- Create: `~/repos/weather/index.html`

**Interfaces:**
- Consumes: `uv-core.js` module exports (`filterToday`, `buildSvg`).
- Produces: the deployable page. `fetchUV()` and `main()` live here (browser-only).

- [ ] **Step 1: Write `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hourly UV — Olivette</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 780px; padding: 0 1rem; color: #222; }
    h1 { font-size: 1.25rem; }
    #chart svg { border: 1px solid #eee; border-radius: 6px; }
    .err { color: #b00; padding: 1rem; border: 1px solid #f3c; border-radius: 6px; }
    .sub { color: #666; font-size: 0.85rem; }
  </style>
</head>
<body>
  <h1>Hourly UV Index — Olivette, MO</h1>
  <p class="sub">Solid = forecast UV, dashed = clear-sky. Source: Open-Meteo.</p>
  <div id="chart">Loading…</div>
  <script type="module">
    import { filterToday, buildSvg } from './uv-core.js';

    const LAT = 38.67, LON = -90.37;
    const URL = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LON}&hourly=uv_index,uv_index_clear_sky&timezone=auto`;

    async function fetchUV() {
      const res = await fetch(URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.hourly || !Array.isArray(json.hourly.time)) throw new Error('malformed response');
      return json.hourly;
    }

    function localToday() {
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }

    async function main() {
      const el = document.getElementById('chart');
      try {
        const h = await fetchUV();
        const points = filterToday(h.time, h.uv_index, h.uv_index_clear_sky, localToday());
        if (!points.length) { el.textContent = 'No UV data for today yet.'; return; }
        el.innerHTML = buildSvg(points);
      } catch (e) {
        console.error(e);
        el.innerHTML = `<div class="err">Couldn't load UV data — try again later.</div>`;
      }
    }
    main();
  </script>
</body>
</html>
```

- [ ] **Step 2: Serve locally and verify the render**

Run: `cd ~/repos/weather && python3 -m http.server 8099`
Then open `http://localhost:8099/` in a browser.
Expected: an SVG chart with a UV curve, dashed clear-sky curve, faint colored bands, hour ticks, and a "peak N @ H:00" label. Console has no errors. (Stop the server with Ctrl-C when done.)

- [ ] **Step 3: Verify the error path**

Temporarily edit `URL` to a bad host (e.g. change the domain to `air-quality-api.invalid`), reload.
Expected: the red "Couldn't load UV data" box, a logged error, no blank page. Revert the edit afterward.

- [ ] **Step 4: Commit**

```bash
cd ~/repos/weather
git add index.html
git commit -m "feat: index.html fetches Open-Meteo and renders hourly UV"
```

---

### Task 4: Deploy to GitHub Pages and verify live

**Files:**
- Create: `~/repos/weather/README.md`

**Interfaces:**
- Consumes: the committed repo.
- Produces: a public `https://<user>.github.io/weather/` URL.

- [ ] **Step 1: Write README**

```markdown
# weather

A personal, dependency-free weather view. v1: today's hourly UV index for
Olivette, MO, from the Open-Meteo air-quality API, rendered as inline SVG.

Open `index.html` (any static host). Logic and tests: `uv-core.js`,
`node --test`.
```

- [ ] **Step 2: Create the GitHub repo and push**

Run:
```bash
cd ~/repos/weather
git add README.md && git commit -m "docs: readme"
gh repo create weather --public --source=. --push
```
Expected: repo created, default branch pushed.

- [ ] **Step 3: Enable Pages**

Run:
```bash
gh api -X POST repos/{owner}/weather/pages -f source[branch]=master -f source[path]=/ 2>/dev/null \
  || gh api -X POST repos/{owner}/weather/pages -f 'build_type=legacy' -f 'source[branch]=main' -f 'source[path]=/'
```
Or enable via the repo Settings → Pages UI (branch = default, folder = root). Wait ~1 min for the first build.

- [ ] **Step 4: Verify live (CORS + timezone + scale)**

Open the published `https://<user>.github.io/weather/` URL.
Expected, checked in the same load:
- **CORS**: chart renders — the cross-origin fetch to Open-Meteo succeeded from the Pages origin (confirm 200 in the Network tab, no CORS error in Console).
- **Timezone**: the x-axis hours and peak label correspond to local (Central) daytime — peak sits near midday, not shifted ~6h.
- **Scale**: on a high-UV summer day the peak is inside the plot, not clipped at the top; y-axis is not inverted (0 at bottom).

- [ ] **Step 5: Final commit (if any tweaks)**

```bash
cd ~/repos/weather
git add -A && git commit -m "chore: post-deploy verification tweaks" || echo "nothing to commit"
git push
```

---

## Self-Review

**Spec coverage:** single static file (Tasks 3–4), no build/deps (all), Open-Meteo endpoint + `timezone=auto` (Tasks 1,3), fetchUV/renderChart unit split (Tasks 2,3 — renderChart realized as `buildSvg`), filter-by-local-date not index (Task 1), y-ceiling `max(11, ceil(maxUV))` + inverted y (Task 2), WHO bands (Tasks 1–2), text error on failure (Task 3), GitHub Pages public URL (Task 4), three live verifications — CORS/timezone/scale (Task 4). All spec sections map to a task.

**Placeholder scan:** no TBD/TODO; every code step shows complete code; test bodies are concrete.

**Type consistency:** `filterToday`, `computeCeiling`, `findPeak`, `WHO_BANDS`, `buildSvg` names and signatures are identical across Tasks 1–3; `index.html` imports only `filterToday` and `buildSvg`, both defined in Tasks 1–2.
