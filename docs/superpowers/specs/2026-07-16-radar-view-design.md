# Animated NEXRAD Radar View — Design

Date: 2026-07-16
Status: Approved (design), pending implementation plan
Extends: the weather dashboard (alerts, matrix, charts, multi-location).

## Goal

A radar map at the top of the page (under the alerts banner): a pannable/
zoomable Leaflet map centered on the active location, with an animated NOAA
NEXRAD loop (last ~50 min, 5-min steps) over an OpenStreetMap base, plus a
play/pause control and a frame-time label. Answers "is a cell moving toward me,
and from where."

## What is architecturally new (and honest scope)

This is the first feature that:
- introduces an external library (Leaflet 1.9.4, BSD-2, **vendored** into
  `vendor/leaflet/`, referenced locally — no runtime CDN), and
- is almost entirely browser-only. Leaflet needs a live, sized DOM container
  and cannot render headless, so the Node-testable surface is deliberately
  thin (frame descriptors + label formatting). The map behavior itself is
  verified live/visually, not by unit tests. The plan says so explicitly
  rather than fabricating coverage.

## Constraints

- FOSS libraries + public/government data. Leaflet is BSD-2; radar is NOAA
  NEXRAD via Iowa Environmental Mesonet (IEM); base is OpenStreetMap.
- No build step, no backend. Vendored asset, not a bundler.
- Renders for the active location; integrates with the existing render-token /
  location-switch machinery without leaking map instances.

## Data sources (all verified live 2026-07-16)

- **Base tiles**: OSM `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
  (attribution required; personal single-user use is within tile policy).
- **Radar frames**: IEM NEXRAD composite relative-time layers, XYZ tiles:
  `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913{SUFFIX}/{z}/{x}/{y}.png`
  where SUFFIX is `''` (current) or `-m05m`, `-m10m`, … `-m50m` (minutes ago).
  Confirmed: all 11 layers return 200 image/png and are byte-distinct (real
  radar motion, not a repeated tile). No API key.

## Pure, Node-tested helpers (the thin testable part, in `uv-core.js`)

- **`radarFrames() → Array<{suffix, offsetMin, label, layer}>`** — the ordered
  loop descriptors, oldest→newest: offsets 50,45,…,5,0 minutes. `suffix` is
  `''` for 0 else `-m${MM}m` (zero-padded to 2, e.g. `-m05m`); `layer` is the
  full IEM layer id `nexrad-n0q-900913${suffix}`; `label` from `frameLabel`.
- **`frameLabel(offsetMin) → string`** — `'now'` for 0, else `'-${offsetMin} min'`.
- These let the animation order, layer ids, and labels be unit-tested without
  a DOM.

## Browser behavior (live-verified, not unit-tested)

- **Map init (once)**: on first render, create one Leaflet map in `#radar-map`
  with the OSM base layer + attribution, a `circleMarker` at the location
  (canvas-drawn — no marker image assets to vendor), initial zoom ~8. Store
  the map + layer handles in module state so it is created exactly once.
- **Radar layers**: build 11 `L.tileLayer`s from `radarFrames()` (IEM URL +
  attribution), all added but only the current-frame layer at opacity ~0.6,
  the rest at 0. Animation advances by toggling opacity between frames.
- **Animation**: a play/pause button and a time label. Playing steps through
  frames oldest→newest on a ~500 ms timer, looping; the label shows the active
  frame's `label`. Paused shows the current (newest) frame. A frame whose tiles
  404 simply shows nothing for that step (Leaflet tolerates missing tiles).
- **Location switch**: on `renderAll()`, if the map exists, `setView` to the
  new location and move the marker — do NOT recreate the map (prevents the
  classic Leaflet "container reused" leak). The radar layers are location-
  independent (CONUS composite), so they are not rebuilt.
- **US-only note**: NEXRAD is CONUS. For a non-US saved location the base map
  still pans there but radar tiles are blank; a small caption notes radar is
  US only.
- **Non-blocking**: radar init is wrapped so any Leaflet failure logs and
  leaves the rest of the page intact (it is independent of the matrix/charts).

## Layout

- Section at the top, directly under `#alerts`, above `#h-matrix`.
- `#radar-map` has an explicit height (e.g. 360px) — Leaflet requires a sized
  container. A play/pause button + `#radar-time` label sit above the map; an
  attribution/US-only caption below.
- Leaflet CSS is loaded from `vendor/leaflet/leaflet.css`; the map must call
  `invalidateSize()` after becoming visible if needed.

## Verification (required before "done")

1. **Pure helpers**: Node tests for `radarFrames()` (11 frames, order
   oldest→newest, correct suffixes incl. zero-pad `-m05m`, layer ids) and
   `frameLabel` (0→'now', 5→'-5 min').
2. **Vendored asset integrity**: Leaflet files present, referenced locally
   (no CDN URL in `index.html`), BSD license included.
3. **Live (the substantive verification)**: controller loads the deployed
   page in a real browser context (or drives it headlessly enough to confirm
   the map container, base tiles, and at least the current radar layer request
   fire); confirms play/pause cycles the label through the frame set and that
   a location switch re-centers without creating a second map.
4. **Deploy**: live Pages URL shows the radar map under alerts; OSM + radar
   tiles load; switching location re-centers; the rest of the page unaffected.

## Out of scope

- Frame prefetch/caching, smooth cross-fade (hard opacity swap is fine).
- Non-CONUS radar sources.
- Storm-cell tracking / velocity products (reflectivity composite only).
- Fullscreen / geolocation.
