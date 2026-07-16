# Outdoor-Workout Conditions Matrix — Design

Date: 2026-07-16
Status: Approved (design), pending implementation plan
Extends: the existing hourly-views page (UV, temp/precip, multi-location).

## Goal

A top-of-page at-a-glance matrix for deciding when to work out outdoors today:
rows = safety/comfort metrics, columns = today's 24 hours, each cell a 3-tier
traffic light (go / caution / no-go) by thresholding that metric at that hour.
Non-daylight hours are shaded so dawn/dusk slots read as dark.

## Constraints (inherited)

- No build step, no dependencies, no backend. Single static page, client-side
  fetch, GitHub Pages.
- Renders for the active location; slices today by location-local date via
  `todayIndices` + `locationToday`. Independent error box under the existing
  `renderToken` race guard.
- Cell values are numeric and row labels are static author strings — no
  untrusted string reaches markup (consistent with the app's XSS discipline).

## Data

Both Open-Meteo endpoints (verified available hourly + keyless 2026-07-16):
- **air-quality**: `uv_index`, `us_aqi`.
- **forecast**: `cape`, `weather_code`, `wind_gusts_10m`, `apparent_temperature`,
  `precipitation`, `is_day`; `temperature_unit=fahrenheit`,
  `wind_speed_unit=mph`, `precipitation_unit=inch`, `timezone=auto`.

`fetchMatrix(lat, lon)` runs both endpoints via `Promise.all`, slices each to
today's hours by its own `utc_offset_seconds` (the two endpoints share the
location so offsets match, but each is sliced independently and then aligned by
hour-of-day), and joins per hour into row objects. The matrix fetches these
endpoints independently of the existing UV/temp/precip sections (one redundant
fetch of each endpoint) — accepted for section isolation and simplicity.

Partial failure: if EITHER endpoint fails, the whole matrix shows its error
box (the matrix is an all-metrics judgment; a half-matrix would be misleading).
This is intentionally stricter than the two independent detail sections.

## Threshold bands (contiguous, half-open; exact-boundary behavior specified)

Each classifier returns `'go' | 'caution' | 'nogo'`. Bands are written so every
real value lands in exactly one band with no gap or overlap at the boundary.

- **UV index**: go `< 3`, caution `3 ≤ uv < 8`, nogo `≥ 8`. (UV exactly 3 →
  caution; exactly 8 → nogo.)
- **US AQI**: go `< 51`, caution `51 ≤ aqi < 101`, nogo `≥ 101`. (51 → caution;
  101 → nogo.)
- **Thunderstorm** `classifyStorm(code, cape)`: nogo if `code ∈ {95,96,99}`
  (checked FIRST); else caution if `cape ≥ 1000`; else go. (Storm code always
  wins over CAPE.)
- **Thermal** `classifyThermal(appT)` bidirectional: nogo if `appT < 20` OR
  `appT ≥ 100`; else caution if `appT < 40` OR `appT ≥ 85`; else go
  (`40 ≤ appT < 85`). (appT exactly 40 → go; exactly 85 → caution; exactly 20
  → caution; exactly 100 → nogo.)
- **Wind gusts (mph)**: go `< 20`, caution `20 ≤ g < 31`, nogo `≥ 31`. (Gust
  exactly 30 → caution; exactly 31 → nogo.)
- **Precip (in/hr)**: go `= 0` (`≤ 0`), caution `0 < p < 0.1`, nogo `≥ 0.1`.
  (Exactly 0.1 → nogo.)

## Rendering — `buildMatrix(hours, opts?)` (pure, returns HTML table string)

`hours` is an array (today, ascending) of
`{hour, isDay, uv, aqi, code, cape, gust, appT, precip}`.

- One header row: a metric-name column plus 24 hour columns labeled `00..23`.
- One row per metric (fixed order: UV, Air quality, Thunderstorm, Thermal,
  Wind gusts, Precip), each cell class `go`/`caution`/`nogo` from the
  matching classifier.
- Non-daylight columns (`isDay === 0`) get an additional `night` class that
  darkens the cell background beneath the traffic-light color.
- **Accessibility (not color alone)**: each cell also carries a single-letter
  glyph — `·` go, `–` caution, `✕` nogo — and a `title`/`aria-label`
  (e.g. "UV 09:00: caution") so red/amber/green is not the only signal
  (colorblind-safe). A small legend maps color+glyph to go/caution/no-go.
- Empty `hours` returns a valid table without throwing.

Because a 6×24 grid is wide, the table sits in a horizontal-scroll container
(`overflow-x:auto`) so it never breaks the page layout on mobile; the metric-
name column is sticky so row labels stay visible while scrolling hours.

## Placement

Top of page, above the UV chart: the matrix is the summary, the SVG charts are
the detail below it. Rendered by `renderMatrix(loc, token)` called from
`renderAll()` before the other renders, under the same token guard.

## Verification (required before "done")

1. **Classifier boundaries**: Node tests assert each exact boundary value
   (UV 3/8, AQI 51/101, gust 30/31, thermal 20/40/85/100, precip 0/0.1) lands
   in the intended band, plus storm code-beats-CAPE ordering.
2. **buildMatrix**: 6 rows + header; cell classes match classifier output on a
   fixture; night columns get the `night` class; every cell has a glyph and a
   title; empty input throws nothing.
3. **Live**: fetch both endpoints for the active location, join, render — 24
   columns, plausible colors for today (controller inspects), thunderstorm row
   reflects today's CAPE.
4. **Partial failure**: simulate one endpoint failing → matrix shows its error
   box; the UV/temp/precip sections still render.
5. **Deploy**: live Pages URL shows the matrix on top; horizontal scroll works;
   glyphs present.

## Out of scope

- Per-user threshold customization.
- A real lightning-strike feed (none is free/keyless; CAPE+WMO is the proxy,
  labeled "Thunderstorm").
- Multi-day matrix (today only).
- Responsive re-render of the SVG charts (separate follow-up).
