export const WHO_BANDS = [
  { min: 0,  max: 3,   label: 'Low',       color: '#a8e05f' },
  { min: 3,  max: 6,   label: 'Moderate',  color: '#fdd835' },
  { min: 6,  max: 8,   label: 'High',      color: '#ff9800' },
  { min: 8,  max: 11,  label: 'Very high', color: '#f44336' },
  { min: 11, max: 100, label: 'Extreme',   color: '#9c27b0' },
];

export function todayIndices(time, todayStr) {
  const out = [];
  for (let i = 0; i < time.length; i++) {
    if (typeof time[i] === 'string' && time[i].startsWith(todayStr)) out.push(i);
  }
  return out;
}

export function filterToday(time, uv, uvClear, todayStr) {
  return todayIndices(time, todayStr).map((i) => ({ time: time[i], uv: uv[i], uvClear: uvClear[i] }));
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

export function locationToday(nowMs, utcOffsetSeconds) {
  const d = new Date(nowMs + utcOffsetSeconds * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

// Location-local date string for today + dayOffset days (dayOffset 0 = today).
export function dateForOffset(nowMs, utcOffsetSeconds, dayOffset) {
  return locationToday(nowMs + dayOffset * 86400000, utcOffsetSeconds);
}

// Short label for a date offset: 'Today', 'Tomorrow', else e.g. 'Sat Jul 19'.
export function dayLabel(dateStr, dayOffset) {
  if (dayOffset === 0) return 'Today';
  if (dayOffset === 1) return 'Tomorrow';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getUTCDay()];
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
  return `${dow} ${mon} ${d}`;
}

function hourOfDay(iso) { return Number(iso.slice(11, 13)); }

// A vertical "current hour" marker for the hourly charts. nowHour is 0..23 (or null to omit).
// xFn maps an hour to an x pixel; pad/height frame the plot. Returns '' when nowHour is not a finite hour.
function nowLine(nowHour, xFn, pad, height) {
  if (!Number.isFinite(nowHour) || nowHour < 0 || nowHour > 23) return '';
  const nx = xFn(nowHour).toFixed(1);
  return `<line x1="${nx}" y1="${pad}" x2="${nx}" y2="${height - pad}" stroke="#4aa8ff" stroke-width="2.5" stroke-dasharray="3 3" opacity="0.9"/>` +
    `<text x="${nx}" y="${pad - 4}" font-size="12" text-anchor="middle" fill="#4aa8ff">now</text>`;
}

export function buildTempSvg(points, opts = {}) {
  const { width = 720, height = 240, pad = 40, nowHour = null } = opts;
  const plotW = width - 2 * pad;
  const plotH = height - 2 * pad;
  const temps = points.map((p) => p.temp);
  let lo = points.length ? Math.floor(Math.min(...temps)) - 2 : 0;
  let hi = points.length ? Math.ceil(Math.max(...temps)) + 2 : 10;
  if (hi - lo < 10) { const mid = (hi + lo) / 2; lo = mid - 5; hi = mid + 5; }
  const x = (h) => pad + (h / 23) * plotW;
  const y = (t) => (height - pad) - ((t - lo) / (hi - lo)) * plotH;

  const poly = points.length
    ? `<polyline points="${points.map((p) => `${x(hourOfDay(p.time)).toFixed(1)},${y(p.temp).toFixed(1)}`).join(' ')}" fill="none" stroke="#e65100" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`
    : '<polyline points="" fill="none" stroke="#e65100"/>';

  let ticks = '';
  for (let h = 0; h <= 23; h += 3) {
    ticks += `<text x="${x(h).toFixed(1)}" y="${height - pad + 16}" font-size="13" text-anchor="middle" fill="#555">${String(h).padStart(2, '0')}</text>`;
  }
  const yStep = Math.max(2, Math.round((hi - lo) / 6));
  for (let v = Math.ceil(lo); v <= hi; v += yStep) {
    ticks += `<text x="${pad - 8}" y="${(y(v) + 4).toFixed(1)}" font-size="13" text-anchor="end" fill="#555">${v}</text>`;
  }

  let labels = '';
  if (points.length) {
    const hiP = points.reduce((a, b) => (b.temp > a.temp ? b : a));
    const loP = points.reduce((a, b) => (b.temp < a.temp ? b : a));
    labels =
      `<circle cx="${x(hourOfDay(hiP.time)).toFixed(1)}" cy="${y(hiP.temp).toFixed(1)}" r="3" fill="#e65100"/>` +
      `<text x="${x(hourOfDay(hiP.time)).toFixed(1)}" y="${(y(hiP.temp) - 8).toFixed(1)}" font-size="15" text-anchor="middle" fill="#e65100">high ${Math.round(hiP.temp)}°</text>` +
      `<circle cx="${x(hourOfDay(loP.time)).toFixed(1)}" cy="${y(loP.temp).toFixed(1)}" r="3" fill="#0277bd"/>` +
      `<text x="${x(hourOfDay(loP.time)).toFixed(1)}" y="${(y(loP.temp) + 16).toFixed(1)}" font-size="15" text-anchor="middle" fill="#0277bd">low ${Math.round(loP.temp)}°</text>`;
  }

  const axis = `<line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#999"/>` +
               `<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#999"/>`;
  const axisTitles =
    `<text x="${(pad + (width - pad) / 2).toFixed(1)}" y="${height - 4}" font-size="13" text-anchor="middle" fill="#777">hour of day</text>` +
    `<text x="14" y="${(height / 2).toFixed(1)}" font-size="13" text-anchor="middle" fill="#777" transform="rotate(-90 14 ${(height / 2).toFixed(1)})">°F</text>`;
  const now = nowLine(nowHour, x, pad, height);

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg">${axis}${ticks}${axisTitles}${now}${poly}${labels}</svg>`;
}

export function buildSvg(points, opts = {}) {
  const { width = 720, height = 320, pad = 40, nowHour = null } = opts;
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
    ? `<polyline points="${toPoly('uv')}" fill="none" stroke="#c62828" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`
    : '<polyline points="" fill="none" stroke="#c62828"/>';
  const clearLine = points.length
    ? `<polyline points="${toPoly('uvClear')}" fill="none" stroke="#7e57c2" stroke-width="2.5" stroke-dasharray="4 3" opacity="0.7" stroke-linecap="round" stroke-linejoin="round"/>`
    : '<polyline points="" fill="none" stroke="#7e57c2"/>';

  // x ticks every 3h
  let ticks = '';
  for (let h = 0; h <= 23; h += 3) {
    ticks += `<text x="${x(h).toFixed(1)}" y="${height - pad + 16}" font-size="13" text-anchor="middle" fill="#555">${String(h).padStart(2, '0')}</text>`;
  }
  // y ticks
  for (let v = 0; v <= ceiling; v += Math.max(1, Math.round(ceiling / 6))) {
    ticks += `<text x="${pad - 8}" y="${(y(v) + 4).toFixed(1)}" font-size="13" text-anchor="end" fill="#555">${v}</text>`;
  }

  let peakLabel = '';
  if (points.length) {
    const pk = findPeak(points);
    const px = x(hourOfDay(pk.time));
    peakLabel = `<circle cx="${px.toFixed(1)}" cy="${y(pk.uv).toFixed(1)}" r="3" fill="#c62828"/>` +
      `<text x="${px.toFixed(1)}" y="${(y(pk.uv) - 8).toFixed(1)}" font-size="15" text-anchor="middle" fill="#c62828">peak ${pk.uv} @ ${hourOfDay(pk.time)}:00</text>`;
  }

  const axis = `<line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#999"/>` +
               `<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#999"/>`;
  const axisTitles =
    `<text x="${(pad + (width - pad) / 2).toFixed(1)}" y="${height - 4}" font-size="13" text-anchor="middle" fill="#777">hour of day</text>` +
    `<text x="14" y="${(height / 2).toFixed(1)}" font-size="13" text-anchor="middle" fill="#777" transform="rotate(-90 14 ${(height / 2).toFixed(1)})">UV index</text>`;
  const now = nowLine(nowHour, x, pad, height);

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg">${bands}${axis}${ticks}${axisTitles}${now}${clearLine}${uvLine}${peakLabel}</svg>`;
}

export function buildPrecipSvg(points, opts = {}) {
  const { width = 720, height = 200, pad = 40, nowHour = null } = opts;
  const plotW = width - 2 * pad;
  const plotH = height - 2 * pad;
  const x = (h) => pad + (h / 23) * plotW;
  const yProb = (p) => (height - pad) - (Math.max(0, Math.min(100, p)) / 100) * plotH;
  const maxAmt = points.reduce((m, p) => Math.max(m, p.amount || 0), 0);
  const amtTop = Math.max(0.1, Math.ceil(maxAmt * 10) / 10);
  const yAmt = (a) => (height - pad) - (Math.max(0, a) / amtTop) * plotH;

  const barW = Math.max(2, (plotW / 24) * 0.7);
  const bars = points
    .map((p) => {
      const bx = x(hourOfDay(p.time)) - barW / 2;
      const top = yProb(p.prob);
      return `<rect x="${bx.toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${(height - pad - top).toFixed(1)}" fill="#4fc3f7" opacity="0.6"/>`;
    })
    .join('');

  const amtLine = points.length
    ? `<polyline points="${points.map((p) => `${x(hourOfDay(p.time)).toFixed(1)},${yAmt(p.amount).toFixed(1)}`).join(' ')}" fill="none" stroke="#01579b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`
    : '<polyline points="" fill="none" stroke="#01579b"/>';

  let ticks = '';
  for (let h = 0; h <= 23; h += 3) {
    ticks += `<text x="${x(h).toFixed(1)}" y="${height - pad + 16}" font-size="13" text-anchor="middle" fill="#555">${String(h).padStart(2, '0')}</text>`;
  }
  for (let p = 0; p <= 100; p += 25) {
    ticks += `<text x="${pad - 8}" y="${(yProb(p) + 4).toFixed(1)}" font-size="12" text-anchor="end" fill="#4fc3f7">${p}%</text>`;
  }
  ticks += `<text x="${width - pad + 6}" y="${(yAmt(amtTop) + 4).toFixed(1)}" font-size="12" text-anchor="start" fill="#01579b">${amtTop}"</text>` +
           `<text x="${width - pad + 6}" y="${(yAmt(0) + 4).toFixed(1)}" font-size="12" text-anchor="start" fill="#01579b">0"</text>`;

  const legend =
    `<rect x="${pad}" y="8" width="10" height="10" fill="#4fc3f7" opacity="0.6"/>` +
    `<text x="${pad + 14}" y="17" font-size="13" fill="#555">prob %</text>` +
    `<line x1="${pad + 70}" y1="13" x2="${pad + 90}" y2="13" stroke="#01579b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<text x="${pad + 94}" y="17" font-size="13" fill="#555">amount in</text>`;

  const axis = `<line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#999"/>` +
               `<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#999"/>`;
  const axisTitle = `<text x="${(pad + (width - pad) / 2).toFixed(1)}" y="${height - 4}" font-size="13" text-anchor="middle" fill="#777">hour of day</text>`;
  const now = nowLine(nowHour, x, pad, height);

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg">${axis}${bars}${amtLine}${ticks}${axisTitle}${now}${legend}</svg>`;
}

// US EPA AQI category bands (US AQI scale), for background shading.
export const AQI_BANDS = [
  { min: 0,   max: 51,  color: '#33c06f' }, // Good
  { min: 51,  max: 101, color: '#f5b73d' }, // Moderate
  { min: 101, max: 151, color: '#ff9800' }, // Unhealthy for sensitive
  { min: 151, max: 201, color: '#f26169' }, // Unhealthy
  { min: 201, max: 301, color: '#9c27b0' }, // Very unhealthy
  { min: 301, max: 501, color: '#7e0023' }, // Hazardous
];

// Air-quality chart: US AQI line over EPA category bands, with PM2.5/PM10/ozone
// current-hour readouts. points: {time, aqi, pm25, pm10, ozone}.
export function buildAqiSvg(points, opts = {}) {
  const { width = 720, height = 240, pad = 40, nowHour = null } = opts;
  const plotW = width - 2 * pad;
  const plotH = height - 2 * pad;
  const maxAqi = points.reduce((m, p) => Math.max(m, p.aqi || 0), 0);
  const ceiling = Math.max(100, Math.ceil((maxAqi + 10) / 25) * 25);
  const x = (h) => pad + (h / 23) * plotW;
  const y = (a) => (height - pad) - (Math.max(0, a) / ceiling) * plotH;

  const bands = AQI_BANDS
    .filter((b) => b.min < ceiling)
    .map((b) => {
      const top = y(Math.min(b.max, ceiling));
      const bot = y(b.min);
      return `<rect x="${pad}" y="${top.toFixed(1)}" width="${plotW}" height="${(bot - top).toFixed(1)}" fill="${b.color}" opacity="0.14"/>`;
    })
    .join('');

  const line = points.length
    ? `<polyline points="${points.map((p) => `${x(hourOfDay(p.time)).toFixed(1)},${y(p.aqi).toFixed(1)}`).join(' ')}" fill="none" stroke="#455a64" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`
    : '<polyline points="" fill="none" stroke="#455a64"/>';

  let ticks = '';
  for (let h = 0; h <= 23; h += 3) {
    ticks += `<text x="${x(h).toFixed(1)}" y="${height - pad + 16}" font-size="13" text-anchor="middle" fill="#555">${String(h).padStart(2, '0')}</text>`;
  }
  const yStep = Math.max(25, Math.round(ceiling / 6 / 25) * 25);
  for (let v = 0; v <= ceiling; v += yStep) {
    ticks += `<text x="${pad - 8}" y="${(y(v) + 4).toFixed(1)}" font-size="12" text-anchor="end" fill="#555">${v}</text>`;
  }

  // component readouts for the "now" hour (or the last available hour)
  let readout = '';
  if (points.length) {
    const cur = points.find((p) => hourOfDay(p.time) === nowHour) || points[points.length - 1];
    const r = (v) => (Number.isFinite(v) ? Math.round(v) : '—');
    readout = `<text x="${width - pad}" y="16" font-size="13" text-anchor="end" fill="#455a64">` +
      `PM2.5 ${r(cur.pm25)} · PM10 ${r(cur.pm10)} · O₃ ${r(cur.ozone)} µg/m³</text>`;
  }

  const axis = `<line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#999"/>` +
               `<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#999"/>`;
  const axisTitles =
    `<text x="${(pad + (width - pad) / 2).toFixed(1)}" y="${height - 4}" font-size="13" text-anchor="middle" fill="#777">hour of day</text>` +
    `<text x="14" y="${(height / 2).toFixed(1)}" font-size="13" text-anchor="middle" fill="#777" transform="rotate(-90 14 ${(height / 2).toFixed(1)})">US AQI</text>`;
  const now = nowLine(nowHour, x, pad, height);

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg">${bands}${axis}${ticks}${axisTitles}${now}${line}${readout}</svg>`;
}

// Wind-gust chart: hourly gust line (mph) with go/caution/nogo threshold bands (20/31).
// points: {time, gust}.
export function buildWindSvg(points, opts = {}) {
  const { width = 720, height = 240, pad = 40, nowHour = null } = opts;
  const plotW = width - 2 * pad;
  const plotH = height - 2 * pad;
  const maxGust = points.reduce((m, p) => Math.max(m, p.gust || 0), 0);
  const ceiling = Math.max(35, Math.ceil((maxGust + 3) / 5) * 5);
  const x = (h) => pad + (h / 23) * plotW;
  const y = (g) => (height - pad) - (Math.max(0, g) / ceiling) * plotH;

  const bands = [
    { min: 0, max: 20, color: '#33c06f' },   // go
    { min: 20, max: 31, color: '#f5b73d' },  // caution
    { min: 31, max: ceiling, color: '#f26169' }, // nogo
  ].filter((b) => b.min < ceiling).map((b) => {
    const top = y(Math.min(b.max, ceiling));
    const bot = y(b.min);
    return `<rect x="${pad}" y="${top.toFixed(1)}" width="${plotW}" height="${(bot - top).toFixed(1)}" fill="${b.color}" opacity="0.14"/>`;
  }).join('');

  const line = points.length
    ? `<polyline points="${points.map((p) => `${x(hourOfDay(p.time)).toFixed(1)},${y(p.gust).toFixed(1)}`).join(' ')}" fill="none" stroke="#0277bd" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`
    : '<polyline points="" fill="none" stroke="#0277bd"/>';

  let ticks = '';
  for (let h = 0; h <= 23; h += 3) {
    ticks += `<text x="${x(h).toFixed(1)}" y="${height - pad + 16}" font-size="13" text-anchor="middle" fill="#555">${String(h).padStart(2, '0')}</text>`;
  }
  const yStep = Math.max(5, Math.round(ceiling / 6 / 5) * 5);
  for (let v = 0; v <= ceiling; v += yStep) {
    ticks += `<text x="${pad - 8}" y="${(y(v) + 4).toFixed(1)}" font-size="12" text-anchor="end" fill="#555">${v}</text>`;
  }

  let peakLabel = '';
  if (points.length) {
    const pk = points.reduce((a, b) => (b.gust > a.gust ? b : a));
    const px = x(hourOfDay(pk.time));
    peakLabel = `<circle cx="${px.toFixed(1)}" cy="${y(pk.gust).toFixed(1)}" r="3" fill="#0277bd"/>` +
      `<text x="${px.toFixed(1)}" y="${(y(pk.gust) - 8).toFixed(1)}" font-size="15" text-anchor="middle" fill="#0277bd">peak ${Math.round(pk.gust)} mph</text>`;
  }

  const axis = `<line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#999"/>` +
               `<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#999"/>`;
  const axisTitles =
    `<text x="${(pad + (width - pad) / 2).toFixed(1)}" y="${height - 4}" font-size="13" text-anchor="middle" fill="#777">hour of day</text>` +
    `<text x="14" y="${(height / 2).toFixed(1)}" font-size="13" text-anchor="middle" fill="#777" transform="rotate(-90 14 ${(height / 2).toFixed(1)})">gust mph</text>`;
  const now = nowLine(nowHour, x, pad, height);

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg">${bands}${axis}${ticks}${axisTitles}${now}${line}${peakLabel}</svg>`;
}

export function buildWeatherTable(points) {
  const head = '<thead><tr><th>Hour</th><th>°F</th><th>Precip %</th><th>Precip in</th></tr></thead>';
  const body = points
    .map((p) => {
      const hh = String(hourOfDay(p.time)).padStart(2, '0');
      return `<tr><td>${hh}:00</td><td>${Math.round(p.temp)}</td><td>${Math.round(p.prob)}</td><td>${Number(p.amount).toFixed(2)}</td></tr>`;
    })
    .join('');
  return `<table>${head}<tbody>${body}</tbody></table>`;
}

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

const r4 = (n) => Math.round(n * 1e4) / 1e4;
export function sameLoc(a, b) { return r4(a.lat) === r4(b.lat) && r4(a.lon) === r4(b.lon); }
export function addLocation(list, loc) {
  return list.some((e) => sameLoc(e, loc)) ? list.slice() : [...list, loc];
}
export function removeLocation(list, loc) {
  return list.filter((e) => !sameLoc(e, loc));
}

export function classifyUV(uv) { return uv < 3 ? 'go' : uv < 8 ? 'caution' : 'nogo'; }
export function classifyAQI(aqi) { return aqi < 51 ? 'go' : aqi < 101 ? 'caution' : 'nogo'; }
export function classifyGust(g) { return g < 20 ? 'go' : g < 31 ? 'caution' : 'nogo'; }
export function classifyThermal(t) {
  if (t < 20 || t >= 100) return 'nogo';
  if (t < 40 || t >= 85) return 'caution';
  return 'go';
}
export function classifyPrecip(p) { return p <= 0 ? 'go' : p < 0.1 ? 'caution' : 'nogo'; }
export function classifyStorm(code, cape) {
  if (code === 95 || code === 96 || code === 99) return 'nogo';
  if (cape >= 1000) return 'caution';
  return 'go';
}

const GLYPH = { go: '·', caution: '–', nogo: '✕' };
const STATE_PENALTY = { go: 0, caution: 1, nogo: 4 };

// The six matrix rows. `panel` names the detail section a cell links to (null = no dedicated panel).
const MATRIX_ROWS = [
  { label: 'UV', panel: 'h-uv', fn: (h) => classifyUV(h.uv) },
  { label: 'Air quality', panel: 'h-aqi', fn: (h) => classifyAQI(h.aqi) },
  { label: 'Thunderstorm', panel: 'h-radar', fn: (h) => classifyStorm(h.code, h.cape) },
  { label: 'Feels like', panel: 'h-temp', fn: (h) => classifyThermal(h.appT) },
  { label: 'Wind gusts', panel: 'h-wind', fn: (h) => classifyGust(h.gust) },
  { label: 'Precip', panel: 'h-precip', fn: (h) => classifyPrecip(h.precip) },
];

// State of one row at one hour, honoring the NWS storm-warning override.
function cellState(row, h) {
  if (row.label === 'Thunderstorm' && h.stormWarning === true) return 'nogo';
  return row.fn(h);
}

// Summed penalty across all six metrics for one hour (go 0, caution 1, nogo 4).
export function hourScore(h) {
  return MATRIX_ROWS.reduce((sum, row) => sum + STATE_PENALTY[cellState(row, h)], 0);
}

// The lowest-penalty daylight hour; returns {hour, score} or null if no daytime hours.
// Ties break toward the earlier hour.
export function bestHour(hours) {
  let best = null;
  for (const h of hours) {
    if (h.isDay === 0) continue;
    const score = hourScore(h);
    if (best === null || score < best.score) best = { hour: h.hour, score };
  }
  return best;
}

// The best contiguous daylight window: the longest run of consecutive daylight hours
// that all share the minimum penalty score. Returns { startHour, endHour, hours:[...], score }
// or null. When several equal-length runs tie, the earliest is chosen.
export function bestWindow(hours) {
  const best = bestHour(hours);
  if (!best) return null;
  let cur = [];
  let winner = [];
  for (const h of hours) {
    const inRun = h.isDay !== 0 && hourScore(h) === best.score;
    if (inRun) {
      cur.push(h.hour);
      if (cur.length > winner.length) winner = cur.slice();
    } else {
      cur = [];
    }
  }
  return { startHour: winner[0], endHour: winner[winner.length - 1], hours: winner, score: best.score };
}

export function buildMatrix(hours) {
  const pad = (n) => String(n).padStart(2, '0');
  const head = '<tr><th class="rowlabel">Metric</th>' +
    hours.map((h) => `<th>${pad(h.hour)}</th>`).join('') + '</tr>';
  const body = MATRIX_ROWS.map((r) => {
    const cells = hours.map((h) => {
      const st = cellState(r, h);
      const note = (r.label === 'Thunderstorm' && h.stormWarning === true) ? ' (NWS warning)' : '';
      const cls = st + (h.isDay === 0 ? ' night' : '');
      const label = `${r.label} ${pad(h.hour)}:00: ${st}${note}`;
      const panelAttr = r.panel ? ` data-panel="${r.panel}"` : '';
      return `<td class="${cls}" title="${label}" aria-label="${label}" data-hour="${h.hour}"${panelAttr}>${GLYPH[st]}</td>`;
    }).join('');
    return `<tr><th class="rowlabel">${r.label}</th>${cells}</tr>`;
  }).join('');
  return `<table class="matrix">${head}${body}</table>`;
}

export function parseAlerts(json) {
  const feats = json && Array.isArray(json.features) ? json.features : [];
  const out = [];
  for (const f of feats) {
    const p = (f && f.properties) || {};
    if (typeof p.event !== 'string') continue;
    out.push({
      event: p.event,
      severity: typeof p.severity === 'string' ? p.severity : 'Unknown',
      onset: p.onset || null,
      ends: p.ends || null,
      expires: p.expires || null,
    });
  }
  return out;
}

export function alertSeverityRank(sev) {
  return { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1 }[sev] || 0;
}

export function isConvectiveAlert(event) {
  return /tornado|thunderstorm/i.test(event) && /warning/i.test(event);
}

export function convectiveHours(alerts, todayStr, offsetSeconds) {
  const covered = new Set();
  for (const a of alerts) {
    if (!isConvectiveAlert(a.event)) continue;
    const onsetMs = Date.parse(a.onset);
    if (Number.isNaN(onsetMs)) continue;
    let endMs = Date.parse(a.ends || a.expires);
    if (Number.isNaN(endMs)) endMs = onsetMs + 3600000;
    for (let h = 0; h < 24; h++) {
      const hh = String(h).padStart(2, '0');
      const startMs = Date.parse(`${todayStr}T${hh}:00:00Z`) - offsetSeconds * 1000;
      const hourEndMs = startMs + 3600000;
      if (onsetMs < hourEndMs && endMs > startMs) covered.add(hh);
    }
  }
  return covered;
}

function esc(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}

function alertWindow(onset, ends) {
  const fmt = (iso) => (typeof iso === 'string' && !Number.isNaN(Date.parse(iso)) ? iso.slice(11, 16) : '');
  const a = fmt(onset), b = fmt(ends);
  if (!a && !b) return '';
  return `${a || '?'}–${b || '?'}`;
}

export function renderAlertBanner(alerts) {
  if (!alerts.length) return '';
  const sorted = alerts.slice().sort((x, y) => alertSeverityRank(y.severity) - alertSeverityRank(x.severity));
  const rows = sorted.map((a) => {
    const rank = alertSeverityRank(a.severity);
    const cls = rank >= 3 ? 'sev-high' : rank === 2 ? 'sev-mid' : 'sev-low';
    const win = alertWindow(a.onset, a.ends);
    return `<div class="alert-row ${cls}"><span class="alert-ev">${esc(a.event)}</span>` +
      (win ? `<span class="alert-win">${esc(win)}</span>` : '') + '</div>';
  }).join('');
  return `<div class="alerts">${rows}</div>`;
}

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
