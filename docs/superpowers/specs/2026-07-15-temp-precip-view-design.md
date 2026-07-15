# Hourly Temperature + Precipitation View — Design

Date: 2026-07-15
Status: Approved (design), pending implementation plan
Extends: 2026-07-14-hourly-uv-page-design.md

## Goal

Add a second view below the existing hourly-UV chart showing today's hourly
temperature and precipitation for the fixed home location (Olivette, MO),
following the sibling `fetch*()` / `render*()` pattern the v1 design
established. Rendered as two stacked inline-SVG panels plus a tabular view.

## Constraints (inherited from v1)

- No build step, no dependencies, no backend. Single static page,
  client-side fetch, GitHub Pages.
- Location hardcoded 38.67, -90.37. US units (°F, inch).
- Slice today's hours by matching the location-local date string against the
  response `time[]` — never by index. Reuse `locationToday(nowMs,
  utcOffsetSeconds)`.

## Data source

The Open-Meteo **forecast** endpoint (distinct from the air-quality endpoint
the UV view uses):

```
https://api.open-meteo.com/v1/forecast?latitude=38.67&longitude=-90.37&hourly=temperature_2m,precipitation_probability,precipitation&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=auto
```

Verified live 2026-07-15: returns `utc_offset_seconds`, `timezone`, and four
parallel length-168 arrays (`time`, `temperature_2m`,
`precipitation_probability`, `precipitation`) in units °F / % / inch.

## Shared refactor (the correctness-critical seam)

Extract a pure primitive and re-base the existing UV filter on it so both
views slice "today" through identical logic:

- **`todayIndices(time, todayStr) -> number[]`** — returns the indices `i`
  where `time[i]` starts with `todayStr`.
- **`filterToday`** is re-implemented as: `todayIndices(time, todayStr).map(i
  => ({time: time[i], uv: uv[i], uvClear: uvClear[i]}))`. Its existing tests
  are unchanged and serve as the regression guard — they must still pass
  byte-for-byte after the refactor. The controller additionally re-runs the
  live UV end-to-end check post-refactor.

## New pure renderers (siblings to `buildSvg`, all return strings, all tested)

- **`buildTempSvg(points, opts?)`** — temperature line. Auto y-scale:
  `min = floor(minTemp) - 2`, `max = ceil(maxTemp) + 2`, then widen to a
  **minimum 10°F span** (so a narrow/sub-freezing day, e.g. 28–34°F, does not
  consume the padding zone and clip). y mapped top-down. Labels the day's high
  and low. `points` are `{time, temp}` for today.
- **`buildPrecipSvg(points, opts?)`** — precipitation probability (0–100%,
  fixed axis) as bars; hourly precip **amount** (inch) overlaid as a thin
  line on an independent right-side scale, with a legend distinguishing the
  two. `points` are `{time, prob, amount}`.
- **`buildWeatherTable(points)`** — HTML `<table>`: columns Hour | °F |
  Precip % | Precip in. `points` are `{time, temp, prob, amount}`.

## Page integration

A new section under the UV chart with three containers (temperature panel →
precipitation panel → table), fed by an **independent** `fetchForecast()`
with its own try/catch and its own `.err` box. A forecast failure shows that
box and leaves the UV chart intact; a UV failure leaves the forecast intact.
This decoupling is deliberate — the two views draw from different endpoints
with independent availability.

`fetchForecast()` validates that `json.hourly` exists, that `time`,
`temperature_2m`, `precipitation_probability`, and `precipitation` are all
arrays of equal length, and that `utc_offset_seconds` is a number; it throws
`'malformed response'` otherwise.

Page order: UV chart → Temperature → Precipitation → Hourly table.

## Verification (required before "done")

1. **UV regression**: existing `filterToday`/UV tests pass unchanged after
   the refactor; controller re-runs the live UV e2e (24 today-points, midday
   peak).
2. **Forecast pipeline**: live fetch → slice today → all three renderers
   produce non-empty output with correct today count.
3. **Temp scale**: render a narrow sub-freezing fixture (e.g. 28–34°F) and a
   wide summer fixture; confirm no clipping, non-inverted y, ≥10°F span.
4. **Deploy**: after merge to master, the live Pages URL renders both
   sections; a simulated forecast failure shows the forecast error box while
   UV still renders.

## Out of scope

- Multi-day (the endpoint returns 168h; v1 of this view shows today only).
- Unit toggle, configurable location, caching.
