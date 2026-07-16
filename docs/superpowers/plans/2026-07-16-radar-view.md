# Animated NEXRAD Radar View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an animated NOAA NEXRAD radar map (Leaflet + IEM tiles over OSM) at the top of the page, centered on the active location, with a play/pause loop.

**Architecture:** Pure frame-descriptor helpers in `uv-core.js` (Node-tested); vendored Leaflet (already committed at `vendor/leaflet/`); a browser-only radar module in `index.html` that creates one persistent map, animates 11 relative-time radar layers, and re-centers on location switch. Browser behavior verified with headless Chrome (DOM + screenshot), not unit tests. No build step, no runtime CDN.

**Tech Stack:** HTML, vanilla ES2020 modules, Leaflet 1.9.4 (vendored, BSD-2), IEM NEXRAD tiles, OpenStreetMap tiles, `node --test`, headless `google-chrome` for live verification.

## Global Constraints

- FOSS + public/government data; Leaflet vendored locally (NO CDN URL in index.html); radar = NOAA NEXRAD via IEM; base = OSM (attribution required).
- Radar layer URL: `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913{SUFFIX}/{z}/{x}/{y}.png`, SUFFIX `''` or `-m05m`…`-m50m`.
- The map is created EXACTLY ONCE; location switch does `setView` + moves the marker, never re-creates the map (Leaflet container-reuse leak).
- Radar init is non-blocking: any Leaflet failure is caught/logged and leaves the matrix/charts/alerts intact.
- Location marker is a `circleMarker` (canvas) — no marker image assets.
- Section placement: top, under `#alerts`, above `#h-matrix`.

---

### Task 1: Pure radar-frame helpers in `uv-core.js`

**Files:**
- Modify: `~/repos/weather/uv-core.js`
- Test: `~/repos/weather/test/radar.test.mjs`

**Interfaces:**
- Produces:
  - `frameLabel(offsetMin) -> string` — `'now'` when 0, else `'-${offsetMin} min'`.
  - `radarFrames() -> Array<{suffix, offsetMin, label, layer}>` — 11 entries, oldest→newest (offsetMin 50,45,…,5,0). `suffix`: `''` for 0, else `-m${MM}m` with MM zero-padded to 2. `layer`: `nexrad-n0q-900913${suffix}`. `label`: `frameLabel(offsetMin)`.

- [ ] **Step 1: Write the failing tests**

```javascript
// test/radar.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { frameLabel, radarFrames } from '../uv-core.js';

test('frameLabel: 0 is now, else -N min', () => {
  assert.equal(frameLabel(0), 'now');
  assert.equal(frameLabel(5), '-5 min');
  assert.equal(frameLabel(50), '-50 min');
});

test('radarFrames returns 11 frames oldest-to-newest', () => {
  const f = radarFrames();
  assert.equal(f.length, 11);
  assert.equal(f[0].offsetMin, 50);   // oldest first
  assert.equal(f[10].offsetMin, 0);   // newest last
});

test('radarFrames suffixes are zero-padded and current has empty suffix', () => {
  const f = radarFrames();
  const byOffset = Object.fromEntries(f.map((x) => [x.offsetMin, x]));
  assert.equal(byOffset[0].suffix, '');
  assert.equal(byOffset[0].layer, 'nexrad-n0q-900913');
  assert.equal(byOffset[5].suffix, '-m05m');       // zero-padded
  assert.equal(byOffset[5].layer, 'nexrad-n0q-900913-m05m');
  assert.equal(byOffset[50].suffix, '-m50m');
  assert.equal(byOffset[0].label, 'now');
  assert.equal(byOffset[5].label, '-5 min');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/repos/weather && node --test`
Expected: FAIL — `frameLabel`/`radarFrames` not exported.

- [ ] **Step 3: Implement in `uv-core.js`**

```javascript
export function frameLabel(offsetMin) {
  return offsetMin === 0 ? 'now' : `-${offsetMin} min`;
}

export function radarFrames() {
  const frames = [];
  for (let offsetMin = 50; offsetMin >= 0; offsetMin -= 5) {
    const suffix = offsetMin === 0 ? '' : `-m${String(offsetMin).padStart(2, '0')}m`;
    frames.push({ suffix, offsetMin, label: frameLabel(offsetMin), layer: `nexrad-n0q-900913${suffix}` });
  }
  return frames;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/repos/weather && node --test`
Expected: PASS — all prior tests plus the radar cases.

- [ ] **Step 5: Commit**

```bash
cd ~/repos/weather
git add uv-core.js test/radar.test.mjs
git commit -m "feat: pure radar frame-descriptor + label helpers"
```

---

### Task 2: Radar map module + wiring in `index.html` (browser; headless-Chrome verified)

**Files:**
- Modify: `~/repos/weather/index.html`

**Interfaces:**
- Consumes: `radarFrames`, `frameLabel` (Task 1); vendored Leaflet global `L`.
- Produces: a persistent Leaflet map created once, animated radar layers, and a `renderRadar(loc)` called from `renderAll()`.

- [ ] **Step 1: Add Leaflet CSS/JS (local) + the radar markup**

In `<head>` (or before the module script), add the VENDORED Leaflet — no CDN:

```html
  <link rel="stylesheet" href="./vendor/leaflet/leaflet.css">
  <script src="./vendor/leaflet/leaflet.js"></script>
```

In the body, immediately after `<div id="alerts"></div>` and before the `#h-matrix` heading, insert:

```html
  <h2 id="h-radar" data-metric="Radar" style="font-size:1.1rem;">Radar</h2>
  <div class="radar-controls">
    <button id="radar-play">▶ Play</button>
    <span id="radar-time" class="sub">now</span>
  </div>
  <div id="radar-map"></div>
  <p class="sub">NOAA NEXRAD (Iowa Environmental Mesonet) · base © OpenStreetMap · radar US only.</p>
```

Add to `<style>`:

```css
    #radar-map { height: 360px; border: 1px solid #eee; border-radius: 6px; }
    .radar-controls { display: flex; gap: 0.75rem; align-items: center; margin-bottom: 0.4rem; }
    #radar-play { font-size: 0.9rem; padding: 4px 10px; cursor: pointer; }
```

- [ ] **Step 2: Add the radar module logic**

Add `radarFrames, frameLabel` to the import. Then add the radar state + functions in the module (Leaflet global `L` is available from the vendored script):

```javascript
    let radar = null; // { map, marker, layers: [{layer, tileLayer}], playing, timer, idx }

    function initRadar(loc) {
      if (typeof L === 'undefined') { console.error('Leaflet not loaded'); return; }
      const map = L.map('radar-map', { attributionControl: true }).setView([loc.lat, loc.lon], 8);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 12, attribution: '© OpenStreetMap',
      }).addTo(map);
      const marker = L.circleMarker([loc.lat, loc.lon], { radius: 6, color: '#c62828', weight: 2, fillOpacity: 0.5 }).addTo(map);
      const frames = radarFrames();
      const layers = frames.map((f) => {
        const tl = L.tileLayer(`https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/${f.layer}/{z}/{x}/{y}.png`, {
          opacity: f.offsetMin === 0 ? 0.6 : 0, maxZoom: 12, attribution: 'NEXRAD © IEM',
        }).addTo(map);
        return { ...f, tileLayer: tl };
      });
      radar = { map, marker, layers, playing: false, timer: null, idx: layers.length - 1 };
    }

    function showFrame(i) {
      radar.layers.forEach((l, j) => l.tileLayer.setOpacity(j === i ? 0.6 : 0));
      radar.idx = i;
      const t = document.getElementById('radar-time');
      if (t) t.textContent = radar.layers[i].label;
    }

    function toggleRadarPlay() {
      const btn = document.getElementById('radar-play');
      if (!radar) return;
      if (radar.playing) {
        clearInterval(radar.timer); radar.timer = null; radar.playing = false;
        if (btn) btn.textContent = '▶ Play';
        showFrame(radar.layers.length - 1); // rest on newest
      } else {
        radar.playing = true;
        if (btn) btn.textContent = '⏸ Pause';
        radar.timer = setInterval(() => {
          showFrame((radar.idx + 1) % radar.layers.length);
        }, 500);
      }
    }

    function renderRadar(loc) {
      try {
        if (!radar) { initRadar(loc); }
        else { radar.map.setView([loc.lat, loc.lon]); radar.marker.setLatLng([loc.lat, loc.lon]); }
      } catch (e) { console.error('radar', e); }
    }
```

Wire the play button once (near the other one-time listeners, e.g. after `rebuildSelect()`):

```javascript
    document.getElementById('radar-play').addEventListener('click', toggleRadarPlay);
```

And call `renderRadar(loc)` from `renderAll()` (it is location-driven but independent of the token'd fetches — call it after the fetch-based renders):

```javascript
    function renderAll() {
      const token = ++renderToken;
      const loc = active();
      updateHeadings(loc);
      renderMatrix(loc, token);
      renderUV(loc, token);
      renderForecast(loc, token);
      renderRadar(loc); // synchronous, no fetch/token needed
    }
```

Also add `'h-radar'` to the `updateHeadings` id loop so its heading tracks the location name.

- [ ] **Step 3: Verify no CDN + structure headlessly (curl)**

Run:
```bash
cd ~/repos/weather && python3 -m http.server 8099 &
sleep 1
curl -sS -o /dev/null -w 'index=%{http_code}\n' http://localhost:8099/index.html
echo "--- vendored leaflet referenced, no CDN ---"
curl -sS http://localhost:8099/index.html | grep -oE '(vendor/leaflet/leaflet\.(js|css)|unpkg\.com|cdn)' | sort -u
curl -sS -o /dev/null -w 'leaflet.js=%{http_code}\n' http://localhost:8099/vendor/leaflet/leaflet.js
curl -sS http://localhost:8099/index.html | grep -oE 'id="(radar-map|radar-play|radar-time|h-radar)"' | sort -u
kill %1 2>/dev/null
```
Expected: `index=200`; only `vendor/leaflet/...` matches (NO unpkg/cdn); `leaflet.js=200`; all four radar ids present.

- [ ] **Step 4: Verify the map actually renders with headless Chrome**

Run (serves the page, loads it in headless Chrome, dumps console + a screenshot, checks the Leaflet container mounted):
```bash
cd ~/repos/weather && python3 -m http.server 8099 &
sleep 1
google-chrome --headless --disable-gpu --no-sandbox --virtual-time-budget=8000 \
  --screenshot=/tmp/claude-1000/-home-jeszyman-repos-org/d5cee2db-2594-4015-a86b-35d1f333ce45/scratchpad/radar.png \
  --window-size=800,1400 "http://localhost:8099/index.html" 2>&1 | tail -3
# Assert Leaflet mounted (the .leaflet-container class is added by L.map) and tiles requested:
google-chrome --headless --disable-gpu --no-sandbox --virtual-time-budget=8000 \
  --dump-dom "http://localhost:8099/index.html" 2>/dev/null | grep -oE 'class="[^"]*leaflet-container[^"]*"|leaflet-tile' | head -3
kill %1 2>/dev/null
ls -la /tmp/claude-1000/-home-jeszyman-repos-org/d5cee2db-2594-4015-a86b-35d1f333ce45/scratchpad/radar.png
```
Expected: DOM contains `leaflet-container` (map mounted) and `leaflet-tile` (tiles injected); a non-trivial screenshot PNG is produced. The controller Reads the screenshot to confirm the map + a location marker are visible.

- [ ] **Step 5: Commit**

```bash
cd ~/repos/weather
git add index.html
git commit -m "feat: animated NEXRAD radar map (vendored Leaflet) at top, re-centers on switch"
```

---

### Task 3: Merge to master and deploy + live verification

**Files:** none (deploy).

- [ ] **Step 1: Controller handles merge via finishing-a-development-branch** (fast-forward master, push; Pages already on master root). Confirm `vendor/leaflet/` is included in the push.

- [ ] **Step 2: Verify live** at `https://jeszyman.github.io/weather/`:
- Vendored Leaflet loads over HTTPS (no CDN, no mixed-content); `vendor/leaflet/leaflet.js` returns 200 from Pages.
- Controller loads the deployed URL in headless Chrome, screenshots it, and Reads the screenshot to confirm: the radar map renders under the alerts region, OSM base + radar overlay tiles are visible, the location marker is on the map.
- Play button cycles `#radar-time` through the frame labels (checked via a short headless script or by re-screenshotting after a click is out of scope for static verify — at minimum confirm the control exists and the newest frame shows).
- Switch location via the dropdown → map re-centers, only one `.leaflet-container` exists (no duplicate map).

---

## Self-Review

**Spec coverage:** vendored Leaflet referenced locally, no CDN (Task 2 Step 1/3); pure `radarFrames`/`frameLabel` Node-tested (Task 1); map created once + `setView`-on-switch, animation via opacity toggle, circleMarker, non-blocking init (Task 2 Step 2); placement under alerts (Task 2 Step 1); headless-Chrome render verification (Task 2 Step 4, Task 3); US-only caption + attribution (Task 2 Step 1). All spec sections map to a task.

**Placeholder scan:** no TBD/TODO; complete code in every step; concrete assertions and the exact headless-Chrome commands.

**Type consistency:** `radarFrames()` entries `{suffix, offsetMin, label, layer}` are consumed in `initRadar` (reads `.layer`, `.offsetMin`, `.label`); `frameLabel` matches the label used in tests and in `showFrame`. `renderRadar(loc)` takes the same `loc` shape (`{name,lat,lon}`) as the other renderers and is called in `renderAll` with `active()`. The map singleton `radar` guards re-creation.
