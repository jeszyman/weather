# NWS Active Alerts (banner + matrix override) — Design

Date: 2026-07-16
Status: Approved (design), pending implementation plan
Extends: the conditions-matrix feature.

## Goal

Surface authoritative NOAA/NWS active weather alerts for the active location:
(a) a severity-colored banner at the very top listing all active alerts, and
(b) a matrix override where convective warnings (Severe Thunderstorm /
Tornado) force the conditions-matrix storm row to no-go during their active
window — upgrading that row from the CAPE+WMO proxy to a real government
warning.

## Constraints (inherited)

- No build step, no dependencies, no backend. Single static page, GitHub
  Pages. FOSS + public/government data (NWS is the authoritative US source).
- Alert text is external/untrusted → reaches the DOM only via
  `createElement` + `setText` (textContent), never innerHTML interpolation.
- Renders under the existing `renderToken` guard.

## Data

`fetchAlerts(lat, lon)` → `https://api.weather.gov/alerts/active?point=<lat>,<lon>`
(keyless; CORS `access-control-allow-origin: *` confirmed; the browser's own
User-Agent satisfies NWS's UA requirement).

**Non-fatal integration**: the alerts fetch joins the matrix's existing
`Promise.all`, but wrapped so its rejection resolves to an empty result
(`fetch(...).then(r => r.ok ? r.json() : null).catch(() => null)`), while the
two Open-Meteo legs stay fatal. If NWS is unreachable, the matrix still
renders and the storm row falls back to `classifyStorm`; the banner is simply
absent. This is the one place a leg of the Promise.all is intentionally
non-fatal.

## Pure, Node-tested helpers (added to `uv-core.js`)

- **`parseAlerts(json)` → `Array<{event, severity, onset, ends, expires, headline}>`**
  Maps `json.features[].properties`; returns `[]` when `features` is absent or
  not an array; skips entries with no `event` string. Missing `severity` →
  `'Unknown'`. `onset`/`ends`/`expires` passed through as the raw ISO strings
  (or null).
- **`alertSeverityRank(sev)` → number** — Extreme=4, Severe=3, Moderate=2,
  Minor=1, else 0. For color selection and most-severe-first sorting.
- **`isConvectiveAlert(event)` → boolean** — true when `event` contains
  "Tornado" or "Thunderstorm" (case-insensitive) AND "Warning" (so watches
  and advisories do not force no-go; only warnings do).
- **`convectiveHours(alerts, todayStr, offsetSeconds)` → Set<string>** — the
  today HH (2-digit) strings covered by any convective alert's active window.
  Algorithm (timezone-exact, the delicate part):
  - For each alert where `isConvectiveAlert(event)`:
    - `onsetMs = Date.parse(onset)`; `endMs = Date.parse(ends || expires)`;
      if `onset` missing skip; if `endMs` NaN use `onsetMs + 3600000`
      (1h default so a null-ended warning still covers its onset hour).
    - For each hour `H` in 0..23: the local-hour window on `todayStr` in
      absolute epoch is
      `startMs = Date.parse(`${todayStr}T${HH}:00:00Z`) - offsetSeconds*1000`
      and `endMs_H = startMs + 3600000`. Mark `H` covered if the alert
      interval overlaps: `onsetMs < endMs_H && endMs > startMs`.
  - Returns the set of covered `HH` strings (zero-padded). Handles alerts
    spanning midnight, entirely-tomorrow (no today hour overlaps → not
    included), and partial hours (onset 13:20/ends 14:40 → covers 13 and 14,
    because the interval overlaps both hour windows). `offsetSeconds` is the
    location's `utc_offset_seconds` (same value the matrix already uses to
    slice today), so alert time and matrix hours share one clock.

## Matrix override

`renderMatrix` computes `convectiveHours(...)` once and sets each hour
object's `stormWarning = coveredSet.has(HH)`. `buildMatrix`'s storm row
becomes: `stormWarning ? 'nogo' : classifyStorm(code, cape)`. The cell's
title/aria-label reads "Thunderstorm HH:00: nogo (NWS warning)" when the
override fires, so the source is legible. All other rows unchanged.

`buildMatrix`'s `hours` objects gain an optional `stormWarning` field
(absent/false → current behavior; the existing matrix tests stay valid).

## Banner

A new `#alerts` region above the conditions matrix, built by
`renderAlerts(alerts)`:
- Sorted most-severe-first via `alertSeverityRank` (stable within rank).
- One row per alert: severity dot/color (Extreme/Severe = red, Moderate =
  amber, Minor/Unknown = grey), the `event` name, and a compact local time
  window from `onset`→`ends` (formatted from the ISO strings). All text via
  `setText` / `createElement`.
- Empty alerts → the region is emptied (no banner chrome).

## Placement & wiring

Banner at the very top (above the matrix). `renderMatrix` already fetches for
the matrix; extend its coordinated fetch to include alerts, then it both
renders the banner and feeds the override — one fetch, one token check. Under
the existing token guard; the banner has no separate error box (a failed
alerts fetch just yields no banner, by the non-fatal design).

## Verification (required before "done")

1. **Pure helpers**: Node tests for `parseAlerts` (normal, missing-features,
   missing-severity, no-event skip), `alertSeverityRank` ordering,
   `isConvectiveAlert` (tornado/tstorm warning true; watch/advisory/heat
   false), and `convectiveHours` — including a fabricated alert with known
   onset/ends and offset asserting the exact HH set, an alert spanning
   midnight, an entirely-tomorrow alert (empty set), and a null-ends alert.
2. **Override**: `buildMatrix` with `stormWarning:true` on an hour forces that
   storm cell to nogo regardless of `code`/`cape`; without it, behavior is
   unchanged (regression).
3. **XSS**: an alert with `event`/`headline` containing markup renders inert
   (banner via textContent).
4. **Live/near-live**: fetch alerts for the active location (likely empty in
   fair weather → no banner, matrix unchanged); controller validates the fetch
   shape and CORS; if any alert is active anywhere, spot-check the banner and
   window formatting against a fabricated fixture.
5. **Deploy**: live Pages URL shows the banner region wired; matrix still
   renders when alerts are empty; simulated NWS failure leaves the matrix
   intact.

## Out of scope

- Alert polygons / geometry (point query only).
- Push/notification; auto-refresh (one fetch per load, like the rest).
- Non-convective alerts influencing the matrix (they appear in the banner
   only; only convective *warnings* override the storm row).
