# weather (CLAUDE.md)

## What this is
Personal outdoor-workout "GO/NO-GO" weather dashboard. Live at https://jeszyman.github.io/weather/ (GitHub Pages, repo `jeszyman/weather`, serves from `master` root).

## Architecture (hard constraints)
- **Dependency-free static site.** No build step, no backend, no framework, no bundler. Files are served as-is.
- `index.html`: inline `<style>` plus one ES-module `<script>`. Holds all browser-only code (`fetch*`, `render*`, DOM wiring, the Leaflet radar, event listeners).
- `uv-core.js`: pure ES module holding ALL data-shaping and SVG/HTML-string builders. This is the tested surface (`node --test`, currently 82 tests in `test/*.mjs`). Every pure function lives here so it can be unit-tested without a DOM.
- Only vendored dependency is **Leaflet 1.9.4** (BSD-2) in `vendor/leaflet/`, referenced locally. NEVER a CDN URL. FOSS libraries plus public/government data only.
- **PWA:** `manifest.webmanifest`, `sw.js` (service worker: cache-first for the same-origin app shell, network-only for all APIs/tiles), `icons/` (PIL-generated PNGs).
- `.nojekyll` at repo root is REQUIRED. GitHub Pages runs Jekyll otherwise, which excludes `vendor/` and 404s Leaflet.

## Data sources (all keyless, public, CORS `*`)
- **Open-Meteo:** hourly forecast (`api.open-meteo.com/v1/forecast`), air quality (`air-quality-api.open-meteo.com`), geocoding (`geocoding-api.open-meteo.com`). Returns 7 days (168h). No reverse geocoding.
- **NWS** `api.weather.gov/alerts/active?point=lat,lon`: active alerts (non-fatal fetch; failure never blanks the matrix).
- **NOAA NEXRAD via Iowa Environmental Mesonet:** radar XYZ tiles (`mesonet.agron.iastate.edu/.../nexrad-n0q-900913{-mNNm}/...`). Observed only, roughly 50 min of history, CONUS. Relative-time layers `-m05m` through `-m50m`.
- **OpenStreetMap:** Leaflet base tiles.

## Conventions
- Slice "today" or the selected day by matching the location-local date STRING against the API `time[]` array, using each endpoint's `utc_offset_seconds`. NEVER index `[0:24]`. Helpers: `locationToday`, `dateForOffset`, `todayIndices`.
- SVG charts: hand-built strings, y mapped top-down (inverted), no-clip geometry (ceiling at least the data max), `nowLine` marker on today only, axis titles plus round-capped lines.
- Matrix classifiers return `'go' | 'caution' | 'nogo'` with half-open contiguous bands; exact boundary behavior is unit-tested. Storm row: an NWS convective warning overrides the CAPE+WMO proxy.
- Untrusted external strings (city names, alert text) reach the DOM ONLY via `textContent`/`createElement` or an escaped builder, never raw `innerHTML` interpolation.
- Radar map created EXACTLY ONCE (singleton guard); location switch does `setView`, never re-inits (Leaflet container-reuse leak). Blanks (`display:none`) on any day but today.

## Dev workflow
- Built subagent-driven (superpowers SDD): feature spec plus plan in `docs/superpowers/`, per-task implement then review, final whole-branch review. Each feature on its own branch, fast-forwarded to `master`, pushed, then verified live.
- Verify with `node --test` PLUS headless-Chrome screenshots read back (`google-chrome --headless=new --screenshot`).
- **Known limitation:** headless Chrome virtual-time cannot complete the live-`fetch` render loop, so in-browser click-throughs (cell-tap to panel, radar-blank, geolocation prompt) are verified by logic-tracing plus unit tests plus standalone SVG renders, NOT automated UI drives. A **Playwright harness is the top deferred item.**
- `uv-core.js` exceeds the repo's 350-line commit guard; commits use `git commit --no-verify` intentionally.
- After pushing, GitHub Pages rebuild takes about 1 min; poll the live asset before claiming deployed.

## Deferred / next
Playwright test harness (pays back verification debt), per-metric threshold tuning, multi-day best-window recommendation, sunrise/sunset chart shading.
