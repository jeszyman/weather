# Multi-Location Support (Presets + City Search) — Design

Date: 2026-07-16
Status: Approved (design), pending implementation plan
Extends: 2026-07-14-hourly-uv-page-design.md, 2026-07-15-temp-precip-view-design.md

## Goal

Let the page show weather for more than the one hardcoded location: a saved-
locations dropdown that the user grows by searching for cities, persisted
across sessions. The current three views (UV, temperature, precipitation)
re-render for whichever location is active.

## Constraints (inherited)

- No build step, no dependencies, no backend. Single static page, client-side
  fetch, GitHub Pages.
- Existing pure render functions (`buildSvg`, `buildTempSvg`,
  `buildPrecipSvg`, `buildWeatherTable`) and slicing helpers (`todayIndices`,
  `locationToday`) are unchanged — this feature only changes what
  coordinates feed them and adds a location UI.

## Data sources

- Existing air-quality + forecast endpoints, now parameterized by lat/lon.
- Open-Meteo **geocoding** (free, keyless), verified live 2026-07-16:
  `https://geocoding-api.open-meteo.com/v1/search?name=<q>&count=5&language=en&format=json`
  Returns `results[]` with `name`, `admin1` (state/region), `country_code`,
  `latitude`, `longitude`, `timezone`. On no match it **omits `results`
  entirely** (no empty array) — must be guarded.

## State model

- **Active location**: `{name, lat, lon}` in a module-scope variable.
- **Saved locations**: an array of `{name, lat, lon}`, persisted in
  localStorage under key `weather.locations.v1` as
  `{v: 1, locations: [...], activeIdx: <int>}`.
  - Seeded with Olivette `{name:'Olivette, MO', lat:38.67, lon:-90.37}` when
    absent/empty.
  - On load, restore `activeIdx`. Any read that fails to parse or fails
    validation (not an object, `locations` not a non-empty array, `activeIdx`
    out of range) → discard and re-seed. No migration machinery (single
    schema version; corrupt/foreign data resets to seed).
  - localStorage wrapped in try/catch: a write or read that throws
    (private-mode, quota, disabled) falls back to an in-memory copy for the
    session and never surfaces an exception.

## Pure, Node-tested helpers (added to `uv-core.js`)

- **`parseGeocode(json) -> Array<{name, lat, lon, label}>`** — maps
  `json.results` to normalized entries. Returns `[]` when `results` is absent
  or not an array. **Skips** any result where `latitude`/`longitude` are not
  finite numbers or `name` is missing. `label` = `name` + `, admin1` (if
  present) + ` ` + `country_code` (if present), for display only.
- **`addLocation(list, loc) -> newList`** — appends `loc` unless an existing
  entry has the same coordinates rounded to **4 decimals** (~11 m); returns
  the (possibly unchanged) list. Pure — returns a new array, does not mutate.
- **`removeLocation(list, loc) -> newList`** — removes the entry matching
  `loc` by 4-decimal-rounded coordinates. Pure.
- Rationale for 4 decimals: distinct cities differ far above 11 m, so no false
  collision; re-adding the exact same geocode result is idempotent.

## Security (the new surface)

City names are the first untrusted, non-numeric API strings that reach the
DOM — in the pick-list rows and in the dynamic view headings. All city-name
insertion goes through a single `setText(el, str)` browser helper that assigns
`textContent` (never `innerHTML`). No city string is ever concatenated into an
`innerHTML` payload. The SVG/table renderers remain numeric-only (unchanged),
so their `innerHTML` use stays safe.

## Fetch refactor + race guard

- `fetchUV(lat, lon)` and `fetchForecast(lat, lon)` take coordinates as
  arguments instead of closing over constants.
- A module-scope monotonic `renderToken` integer guards against stale
  overwrites. `renderAll()` increments it, captures the value locally, awaits
  both fetches, and **only writes to the DOM if its captured token still
  equals the current `renderToken`**. Switching location B while A is in
  flight bumps the token, so A's late response is discarded rather than
  painting over B. The two views keep their independent try/catch error
  boxes; the token check wraps each view's own render.

## UI — location bar (above the UV chart)

- `<select id="locsel">` of saved locations (label = `name`).
- Text `<input id="locq">` + `<button>Search</button>`.
- `<button>✕</button>` removes the active location.
- `<div id="picks">` for the search results pick list (empty until a search).

Behavior:
- Changing the `<select>` sets active to that saved location and re-renders.
- Search: `geocodeCity(q)` fetches the endpoint, `parseGeocode` normalizes,
  and each match renders as a clickable row (label via `setText`). Empty
  input or zero matches shows a message in `#picks`. Clicking a row:
  `addLocation` → persist → set active to it → rebuild `<select>` → clear
  `#picks` → `renderAll()`.
- Remove (✕): if more than one saved location, `removeLocation` the active
  one and switch active to the first remaining; if only one remains, it is a
  no-op (forbidden) with a brief message — the list can never become empty
  (Olivette re-seeds if it somehow would).

Headings: the three section headings show the active location's `name` via
`setText`, updated on every `renderAll()`.

## Verification (required before "done")

1. **Pure helpers**: Node tests for `parseGeocode` (normal, missing-`results`,
   malformed-entry-skipping), `addLocation` (append + dedupe), `removeLocation`.
2. **XSS**: a saved/geocoded location with a name containing `<img src=x
   onerror=...>` renders as inert text in both the pick list and the headings
   (assert via the `setText`/textContent path; controller spot-checks the
   built DOM string has no live tag).
3. **Race**: switching locations does not leave a stale render (controller
   reasons through the token guard; a fabricated slow/fast ordering test on
   the token logic if feasible).
4. **Live**: search "Springfield" → pick list of 5 → choose Missouri → all
   three views render for 37.22,-93.30; reload restores it; switch back to
   Olivette via dropdown.
5. **Deploy**: live Pages URL shows the location bar; search + switch works
   cross-origin (geocoding CORS confirmed).

## Out of scope

- Responsive/resize re-render (separate follow-up).
- Browser geolocation ("use my location") button.
- Reordering saved locations; renaming; more than `count=5` matches.
