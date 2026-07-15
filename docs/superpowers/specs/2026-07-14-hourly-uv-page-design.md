# Hourly UV Page — Design

Date: 2026-07-14
Status: Approved (design), pending implementation plan

## Goal

Ship a minimal, public web page that shows today's hourly UV index for a
fixed home location (Olivette, MO). Primary purpose is to learn the real
build effort of a custom, open-data weather view and establish a pattern
that extends to additional views (temperature, air quality, multi-day
forecast) later.

## Constraints

- **Public URL**, reachable from any device (phone included).
- **UV is the only view for v1.** No other metrics.
- **Minimal**: no build step, no dependencies, no backend.
- Location **hardcoded** to Olivette (38.67, -90.37) for v1.

## Architecture

A single static `index.html` served from GitHub Pages. All logic is
client-side vanilla JavaScript. No framework, no bundler, no npm.

Data comes from the Open-Meteo Air Quality API, which is free, requires
no API key, and sends permissive CORS headers so the browser can call it
directly:

```
https://air-quality-api.open-meteo.com/v1/air-quality?latitude=38.67&longitude=-90.37&hourly=uv_index,uv_index_clear_sky&timezone=auto
```

`timezone=auto` makes the API resolve the location's local timezone and
return the `hourly.time` array as local ISO-8601 strings
(`YYYY-MM-DDTHH:00`), which the slicing logic depends on.

## Components (units)

Two functions with a clean boundary, so future views are sibling
additions rather than rewrites:

- **`fetchUV()`** — issues the fetch, returns the parsed JSON (or throws).
  What it does: network + parse. Depends on: the Open-Meteo endpoint.
- **`renderChart(hours)`** — takes an array of `{time, uv, uvClear}`
  points for today and produces the inline SVG. What it does: pure
  rendering. Depends on: nothing external; deterministic from its input.
- **A small `main()`** wires them: fetch → reduce to today's points →
  render, with a try/catch that swaps in a text error node on failure.

Later views (temperature, AQI, forecast) become their own
`fetch*()` / `render*()` pairs calling the same shape of code.

## Data flow

1. On load, `main()` calls `fetchUV()`.
2. Response JSON has parallel arrays `hourly.time[]`, `hourly.uv_index[]`,
   `hourly.uv_index_clear_sky[]`.
3. Compute today's local date string (`YYYY-MM-DD`) and **filter the
   points whose `time` starts with that string** — do NOT slice `[0:24]`
   by index (guards against timezone-boundary off-by-one).
4. Zip the filtered indices into `{time, uv, uvClear}` objects.
5. Pass to `renderChart()`.

## Rendering detail (inline SVG)

- x-axis: hour of day (00–23), labeled at a readable interval (e.g. every
  3h).
- y-axis: UV index, from 0 to a ceiling of `max(11, ceil(maxUV))` so a
  high summer reading is never clipped. SVG y is top-down, so map
  `y_px = height - (uv / ceiling) * plotHeight` — invert deliberately.
- WHO risk bands as faint horizontal background shading: 0–2 low (green),
  3–5 moderate (yellow), 6–7 high (orange), 8–10 very high (red), 11+
  extreme (purple).
- `uv_index` as the primary polyline; `uv_index_clear_sky` as a lighter /
  dashed secondary polyline.
- A text callout: peak UV value and the hour it occurs.

## Error handling

If `fetchUV()` rejects or returns malformed data, `main()` renders a
plain text message (e.g. "Couldn't load UV data — try again later.")
into the page container instead of leaving a blank page. Errors are also
`console.error`-logged for diagnosis.

## Deployment

- New repo `~/repos/weather`, `index.html` at root.
- GitHub Pages serving from the default branch root.
- Result is a public `https://<user>.github.io/weather/` URL.

## Verification (required before "done")

1. **CORS on the live domain**: after deploy, open the GH Pages URL and
   confirm the fetch succeeds from that origin (browser Network tab), not
   just from localhost / file://.
2. **Timezone slicing**: confirm the rendered hours are today's local
   hours, not shifted by the UTC offset. Filter-by-date-string, verified
   against the `time` array.
3. **SVG scale**: render against a fixture with UV ≥ 8 and confirm no
   clipping, correct (non-inverted) y-axis, non-overlapping labels.

## Explicitly out of scope for v1

- Any view other than UV.
- Location input, geolocation, or multi-location.
- Caching / service worker / offline.
- A chart library or build tooling (revisit only if mobile interactivity
  or many views justify it).

## Extension path

Adding a view = add a `fetch*()` + `render*()` pair and a container
element. The `timezone=auto` + filter-by-local-date pattern and the SVG
scaffolding are reused. No architectural change needed to reach the
temperature / AQI / forecast views.
