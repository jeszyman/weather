# Multi-Location Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a saved-locations dropdown plus city search so the three weather views render for any chosen location, persisted across sessions.

**Architecture:** New pure helpers in `uv-core.js` (geocode parsing, add/remove-with-dedupe), Node-tested. Browser-only concerns in `index.html`: a localStorage wrapper with in-memory fallback, coordinate-parameterized fetches, a monotonic render-token race guard, a single `setText` XSS-safe DOM writer, and a location-bar UI. No build step, no dependencies.

**Tech Stack:** HTML, vanilla ES2020 modules, Open-Meteo air-quality/forecast/geocoding APIs, `node --test`.

## Global Constraints

- No build step, no runtime dependencies, no backend.
- Geocoding endpoint: `https://geocoding-api.open-meteo.com/v1/search?name=<q>&count=5&language=en&format=json`; on no match the response OMITS `results` (guard for absence, not empty array).
- Existing render functions and `todayIndices`/`locationToday` are unchanged; only coordinates feeding them change.
- Dedupe locations by coordinates rounded to **4 decimals**.
- Every city-name string reaching the DOM goes through `setText(el, str)` (textContent) — never `innerHTML` interpolation.
- localStorage key `weather.locations.v1`, shape `{v:1, locations:[{name,lat,lon}], activeIdx:int}`; any parse/validation failure re-seeds with Olivette `{name:'Olivette, MO', lat:38.67, lon:-90.37}`. All localStorage access try/catch-wrapped with in-memory fallback.
- A monotonic `renderToken` guards renders: a render paints the DOM only if its captured token still equals the current token when awaits resolve.

---

### Task 1: Pure geocode/location helpers in `uv-core.js`

**Files:**
- Modify: `~/repos/weather/uv-core.js`
- Test: `~/repos/weather/test/location.test.mjs`

**Interfaces:**
- Produces:
  - `parseGeocode(json) -> Array<{name, lat, lon, label}>` — maps `json.results`; returns `[]` if `results` absent/not-array; skips entries whose `latitude`/`longitude` aren't finite numbers or whose `name` is missing. `label` = `name` + (`, ${admin1}` if truthy) + (` ${country_code}` if truthy).
  - `sameLoc(a, b) -> boolean` — true if `a.lat`/`a.lon` equal `b.lat`/`b.lon` rounded to 4 decimals.
  - `addLocation(list, loc) -> Array` — new array; appends `loc` unless some entry `sameLoc(entry, loc)`.
  - `removeLocation(list, loc) -> Array` — new array without entries `sameLoc(entry, loc)`.

- [ ] **Step 1: Write the failing tests**

```javascript
// test/location.test.mjs
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/repos/weather && node --test`
Expected: FAIL — the four helpers are not exported.

- [ ] **Step 3: Implement in `uv-core.js`**

```javascript
export function parseGeocode(json) {
  const results = json && Array.isArray(json.results) ? json.results : [];
  const out = [];
  for (const r of results) {
    const lat = r.latitude, lon = r.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !r.name) continue;
    const label = r.name + (r.admin1 ? `, ${r.admin1}` : '') + (r.country_code ? ` ${r.country_code}` : '');
    out.push({ name: r.name, lat, lon, label });
  }
  return out;
}

const r4 = (n) => Math.round(n * 1e4) / 1e4;
export function sameLoc(a, b) { return r4(a.lat) === r4(b.lat) && r4(a.lon) === r4(b.lon); }
export function addLocation(list, loc) {
  return list.some((e) => sameLoc(e, loc)) ? list.slice() : [...list, loc];
}
export function removeLocation(list, loc) {
  return list.filter((e) => !sameLoc(e, loc));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/repos/weather && node --test`
Expected: PASS — all prior tests plus the six new location cases.

- [ ] **Step 5: Commit**

```bash
cd ~/repos/weather
git add uv-core.js test/location.test.mjs
git commit -m "feat: pure geocode parse + add/remove-with-dedupe helpers"
```

---

### Task 2: localStorage wrapper with validation + in-memory fallback

This is browser code but is written as small testable pure-ish functions. The store validation logic (`loadState`/`validateState`) is pure over an injected raw string; the actual `localStorage` read/write is a thin try/catch wrapper around it. Only the pure part is unit-tested.

**Files:**
- Modify: `~/repos/weather/uv-core.js` (add pure `validateState`, `seedState`)
- Test: `~/repos/weather/test/store.test.mjs`

**Interfaces:**
- Produces:
  - `SEED -> {v:1, locations:[{name:'Olivette, MO', lat:38.67, lon:-90.37}], activeIdx:0}` (exported constant factory `seedState()` returning a fresh copy).
  - `validateState(raw) -> stateObject` — parses `raw` (a string or null); returns it if it is a valid state (`v===1`, `locations` a non-empty array of `{name,lat,lon}` with finite coords, `activeIdx` an integer in range); otherwise returns `seedState()`.

- [ ] **Step 1: Write the failing tests**

```javascript
// test/store.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateState, seedState } from '../uv-core.js';

test('seedState returns Olivette default', () => {
  const s = seedState();
  assert.equal(s.v, 1);
  assert.equal(s.activeIdx, 0);
  assert.equal(s.locations[0].name, 'Olivette, MO');
  assert.equal(s.locations[0].lat, 38.67);
});

test('validateState re-seeds on null / garbage / bad JSON', () => {
  assert.deepEqual(validateState(null), seedState());
  assert.deepEqual(validateState('not json{'), seedState());
  assert.deepEqual(validateState('{"v":2,"locations":[],"activeIdx":0}'), seedState());
  assert.deepEqual(validateState('{"v":1,"locations":[],"activeIdx":0}'), seedState()); // empty
  assert.deepEqual(validateState('{"v":1,"locations":[{"name":"X","lat":1,"lon":2}],"activeIdx":5}'), seedState()); // idx OOR
});

test('validateState passes a well-formed state through', () => {
  const good = { v: 1, locations: [{ name: 'X', lat: 1, lon: 2 }, { name: 'Y', lat: 3, lon: 4 }], activeIdx: 1 };
  assert.deepEqual(validateState(JSON.stringify(good)), good);
});

test('validateState rejects locations with non-finite coords', () => {
  assert.deepEqual(validateState('{"v":1,"locations":[{"name":"X","lat":"a","lon":2}],"activeIdx":0}'), seedState());
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/repos/weather && node --test`
Expected: FAIL — `validateState` / `seedState` not exported.

- [ ] **Step 3: Implement in `uv-core.js`**

```javascript
export function seedState() {
  return { v: 1, locations: [{ name: 'Olivette, MO', lat: 38.67, lon: -90.37 }], activeIdx: 0 };
}

export function validateState(raw) {
  try {
    const s = JSON.parse(raw);
    const okLoc = (l) => l && typeof l.name === 'string' && Number.isFinite(l.lat) && Number.isFinite(l.lon);
    if (s && s.v === 1 && Array.isArray(s.locations) && s.locations.length > 0 &&
        s.locations.every(okLoc) && Number.isInteger(s.activeIdx) &&
        s.activeIdx >= 0 && s.activeIdx < s.locations.length) {
      return s;
    }
  } catch (_) { /* fall through */ }
  return seedState();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/repos/weather && node --test`
Expected: PASS — all tests including the four new store cases.

- [ ] **Step 5: Commit**

```bash
cd ~/repos/weather
git add uv-core.js test/store.test.mjs
git commit -m "feat: state seed + validation (re-seed on corrupt/foreign data)"
```

---

### Task 3: index.html — coordinate-parameterized fetches, storage glue, render-token guard

**Files:**
- Modify: `~/repos/weather/index.html`

**Interfaces:**
- Consumes: `validateState`, `seedState`, `parseGeocode`, `addLocation`, `removeLocation` and existing exports.
- Produces: `renderAll()` that fetches+renders both views for the active location under a token guard; a `store` object; a `setText` helper. (UI wiring is Task 4.)

- [ ] **Step 1: Refactor fetches to take (lat, lon) and add the module scaffolding**

Replace the existing `<script type="module">` contents. Update the import line to add the new names, then structure it so both fetches take coordinates and a token guards rendering:

```javascript
    import { filterToday, buildSvg, locationToday, todayIndices, buildTempSvg, buildPrecipSvg, buildWeatherTable,
             parseGeocode, addLocation, removeLocation, sameLoc, validateState, seedState } from './uv-core.js';

    const LS_KEY = 'weather.locations.v1';
    let mem = null; // in-memory fallback when localStorage throws
    const store = {
      load() {
        try { return validateState(localStorage.getItem(LS_KEY)); }
        catch (_) { return mem ? validateState(JSON.stringify(mem)) : seedState(); }
      },
      save(state) {
        mem = state;
        try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (_) { /* in-memory only */ }
      },
    };

    let state = store.load();
    const active = () => state.locations[state.activeIdx];

    function setText(el, str) { el.textContent = str; }

    let renderToken = 0;

    async function fetchUV(lat, lon) {
      const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=uv_index,uv_index_clear_sky&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      if (!j.hourly || !Array.isArray(j.hourly.time) || typeof j.utc_offset_seconds !== 'number') throw new Error('malformed response');
      return j;
    }

    async function fetchForecast(lat, lon) {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation_probability,precipitation&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=auto`;
      const res = await fetch(url);
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

    async function renderUV(loc, token) {
      const el = document.getElementById('chart');
      try {
        const j = await fetchUV(loc.lat, loc.lon);
        if (token !== renderToken) return;
        const pts = filterToday(j.hourly.time, j.hourly.uv_index, j.hourly.uv_index_clear_sky, locationToday(Date.now(), j.utc_offset_seconds));
        el.innerHTML = pts.length ? buildSvg(pts) : '';
        if (!pts.length) el.textContent = 'No UV data for today yet.';
      } catch (e) {
        if (token !== renderToken) return;
        console.error(e);
        el.innerHTML = `<div class="err">Couldn't load UV data — try again later.</div>`;
      }
    }

    async function renderForecast(loc, token) {
      const tEl = document.getElementById('temp');
      const pEl = document.getElementById('precip');
      const wEl = document.getElementById('wtable');
      try {
        const j = await fetchForecast(loc.lat, loc.lon);
        if (token !== renderToken) return;
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
        if (token !== renderToken) return;
        console.error(e);
        tEl.innerHTML = `<div class="err">Couldn't load forecast — try again later.</div>`;
        pEl.innerHTML = ''; wEl.innerHTML = '';
      }
    }

    function updateHeadings(loc) {
      for (const id of ['h-uv', 'h-temp', 'h-precip']) {
        const el = document.getElementById(id);
        if (el) setText(el, `${el.dataset.metric} — ${loc.name}`);
      }
    }

    function renderAll() {
      const token = ++renderToken;
      const loc = active();
      updateHeadings(loc);
      renderUV(loc, token);
      renderForecast(loc, token);
    }
```

- [ ] **Step 2: Update the headings markup to be dynamic**

In the HTML body, give each of the three headings an id and a `data-metric`, and remove the hardcoded "Olivette, MO" text (it is now set by `updateHeadings`). Replace the existing UV `<h1>` and the two forecast `<h2>`s:

```html
  <h1 id="h-uv" data-metric="Hourly UV Index">Hourly UV Index</h1>
  <p class="sub">Solid = forecast UV, dashed = clear-sky. Source: Open-Meteo.</p>
  <div id="chart">Loading…</div>

  <h2 id="h-temp" data-metric="Temperature" style="font-size:1.1rem;margin-top:2rem;">Temperature</h2>
  <div id="temp">Loading…</div>
  <h2 id="h-precip" data-metric="Precipitation" style="font-size:1.1rem;margin-top:1.5rem;">Precipitation</h2>
  <p class="sub">Bars = chance of rain (%), line = hourly amount (in).</p>
  <div id="precip">Loading…</div>
  <h2 style="font-size:1.1rem;margin-top:1.5rem;">Hourly detail</h2>
  <div id="wtable">Loading…</div>
```

- [ ] **Step 3: Kick off the initial render**

At the end of the module (replacing the old `main(); ... mainForecast();` calls), call:

```javascript
    renderAll();
```

- [ ] **Step 4: Smoke-serve and verify structure headlessly**

Run:
```bash
cd ~/repos/weather && python3 -m http.server 8099 &
sleep 1
curl -sS -o /dev/null -w 'index=%{http_code}\n' http://localhost:8099/index.html
curl -sS http://localhost:8099/index.html | grep -oE 'id="(chart|temp|precip|wtable|h-uv|h-temp|h-precip)"' | sort -u
kill %1 2>/dev/null
```
Expected: `index=200` and all seven ids present.

- [ ] **Step 5: Commit**

```bash
cd ~/repos/weather
git add index.html
git commit -m "refactor: coordinate-parameterized fetches + render-token guard + dynamic headings"
```

---

### Task 4: Location bar UI (select, search, pick list, remove)

**Files:**
- Modify: `~/repos/weather/index.html`

**Interfaces:**
- Consumes: everything from Task 3 (`store`, `state`, `active`, `setText`, `renderAll`, `parseGeocode`, `addLocation`, `removeLocation`).

- [ ] **Step 1: Add the location-bar markup and styles**

Immediately after `<body>` opening and before the UV heading, insert:

```html
  <div id="locbar">
    <select id="locsel" aria-label="Saved locations"></select>
    <input id="locq" type="text" placeholder="Search city…" aria-label="Search city">
    <button id="locsearch">Search</button>
    <button id="locremove" title="Remove current location">✕</button>
    <div id="picks"></div>
  </div>
```

Add to the `<style>` block:

```css
    #locbar { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-bottom: 1rem; }
    #locbar select, #locbar input, #locbar button { font-size: 0.9rem; padding: 4px 8px; }
    #picks { flex-basis: 100%; }
    #picks button { display: block; width: 100%; text-align: left; padding: 6px 8px; margin: 2px 0; border: 1px solid #ddd; background: #fafafa; cursor: pointer; }
    #picks button:hover { background: #eef; }
    #picks .msg { color: #666; font-size: 0.85rem; padding: 4px 0; }
```

- [ ] **Step 2: Add the UI wiring at the end of the module (before `renderAll()`)**

```javascript
    const selEl = document.getElementById('locsel');
    const qEl = document.getElementById('locq');
    const picksEl = document.getElementById('picks');

    function rebuildSelect() {
      selEl.innerHTML = '';
      state.locations.forEach((loc, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        setText(opt, loc.name);
        if (i === state.activeIdx) opt.selected = true;
        selEl.appendChild(opt);
      });
    }

    selEl.addEventListener('change', () => {
      state.activeIdx = Number(selEl.value);
      store.save(state);
      renderAll();
    });

    document.getElementById('locremove').addEventListener('click', () => {
      if (state.locations.length <= 1) {
        picksEl.innerHTML = '';
        const m = document.createElement('div'); m.className = 'msg';
        setText(m, 'Keep at least one location.'); picksEl.appendChild(m);
        return;
      }
      const list = removeLocation(state.locations, active());
      state = { v: 1, locations: list, activeIdx: 0 };
      store.save(state);
      rebuildSelect();
      renderAll();
    });

    function pickMessage(text) {
      picksEl.innerHTML = '';
      const m = document.createElement('div'); m.className = 'msg';
      setText(m, text); picksEl.appendChild(m);
    }

    async function doSearch() {
      const q = qEl.value.trim();
      if (!q) { pickMessage('Type a city name to search.'); return; }
      pickMessage('Searching…');
      let matches = [];
      try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`);
        matches = parseGeocode(await res.json());
      } catch (e) { console.error(e); pickMessage('Search failed — try again.'); return; }
      if (!matches.length) { pickMessage('No matches.'); return; }
      picksEl.innerHTML = '';
      for (const m of matches) {
        const b = document.createElement('button');
        setText(b, m.label);
        b.addEventListener('click', () => {
          const loc = { name: m.label, lat: m.lat, lon: m.lon };
          const list = addLocation(state.locations, loc);
          const idx = list.findIndex((e) => sameLoc(e, loc));
          state = { v: 1, locations: list, activeIdx: idx >= 0 ? idx : list.length - 1 };
          store.save(state);
          rebuildSelect();
          picksEl.innerHTML = '';
          qEl.value = '';
          renderAll();
        });
        picksEl.appendChild(b);
      }
    }

    document.getElementById('locsearch').addEventListener('click', doSearch);
    qEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

    rebuildSelect();
```

- [ ] **Step 3: Smoke-serve and verify the location bar is present**

Run:
```bash
cd ~/repos/weather && python3 -m http.server 8099 &
sleep 1
curl -sS http://localhost:8099/index.html | grep -oE 'id="(locbar|locsel|locq|locsearch|locremove|picks)"' | sort -u
kill %1 2>/dev/null
```
Expected: all six location-bar ids present.

- [ ] **Step 4: Commit**

```bash
cd ~/repos/weather
git add index.html
git commit -m "feat: location bar — saved select, city search, pick list, remove"
```

---

### Task 5: Merge to master and deploy + live verification

**Files:** none (deploy + verification).

- [ ] **Step 1: Controller handles merge via finishing-a-development-branch** (fast-forward master to this branch, push; Pages already enabled on master root).

- [ ] **Step 2: Verify live**

Open `https://jeszyman.github.io/weather/`:
- Location bar renders; the dropdown shows Olivette; all three views render for it.
- Type "Springfield", Search → a pick list of ~5 rows (name, state, country).
- Click "Springfield, Missouri US" → views re-render for ~37.22,-93.30; the dropdown now includes it and it's selected; headings show its name.
- Reload → the page restores Springfield (persistence).
- Switch back to Olivette via the dropdown.
- XSS spot check: no city-name path uses innerHTML (verify in the deployed source that pick rows and options are built with textContent).

---

## Self-Review

**Spec coverage:** pure helpers `parseGeocode`/`sameLoc`/`addLocation`/`removeLocation` with 4-decimal dedupe and malformed-entry skipping (Task 1); state seed + `validateState` re-seed-on-corrupt (Task 2); coordinate-parameterized `fetchUV`/`fetchForecast`, `renderToken` race guard, dynamic headings via `setText`, localStorage wrapper with in-memory fallback (Task 3); location bar with select/search/pick-list/remove, remove-guard for last location, all city-name writes via `setText`/`createElement` (Task 4); live deploy verification incl. XSS spot check (Task 5). All spec sections map to a task.

**Placeholder scan:** no TBD/TODO; complete code in every step; concrete test assertions.

**Type consistency:** `parseGeocode` returns `{name,lat,lon,label}`; Task 4 constructs a saved `{name,lat,lon}` from `m.label`/`m.lat`/`m.lon` and passes it through `addLocation`. `sameLoc`/`addLocation`/`removeLocation` operate on `{lat,lon}`-bearing objects consistently. `state` shape `{v,locations,activeIdx}` is identical across `seedState`, `validateState`, Task 3 `store`, and Task 4 mutations. `setText(el, str)` signature stable. Fetch signatures `(lat, lon)` match all call sites in `renderUV`/`renderForecast`.
