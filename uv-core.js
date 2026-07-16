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

function hourOfDay(iso) { return Number(iso.slice(11, 13)); }

export function buildTempSvg(points, opts = {}) {
  const { width = 720, height = 240, pad = 40 } = opts;
  const plotW = width - 2 * pad;
  const plotH = height - 2 * pad;
  const temps = points.map((p) => p.temp);
  let lo = points.length ? Math.floor(Math.min(...temps)) - 2 : 0;
  let hi = points.length ? Math.ceil(Math.max(...temps)) + 2 : 10;
  if (hi - lo < 10) { const mid = (hi + lo) / 2; lo = mid - 5; hi = mid + 5; }
  const x = (h) => pad + (h / 23) * plotW;
  const y = (t) => (height - pad) - ((t - lo) / (hi - lo)) * plotH;

  const poly = points.length
    ? `<polyline points="${points.map((p) => `${x(hourOfDay(p.time)).toFixed(1)},${y(p.temp).toFixed(1)}`).join(' ')}" fill="none" stroke="#e65100" stroke-width="2"/>`
    : '<polyline points="" fill="none" stroke="#e65100"/>';

  let ticks = '';
  for (let h = 0; h <= 23; h += 3) {
    ticks += `<text x="${x(h).toFixed(1)}" y="${height - pad + 16}" font-size="11" text-anchor="middle" fill="#555">${String(h).padStart(2, '0')}</text>`;
  }
  const yStep = Math.max(2, Math.round((hi - lo) / 6));
  for (let v = Math.ceil(lo); v <= hi; v += yStep) {
    ticks += `<text x="${pad - 8}" y="${(y(v) + 4).toFixed(1)}" font-size="11" text-anchor="end" fill="#555">${v}</text>`;
  }

  let labels = '';
  if (points.length) {
    const hiP = points.reduce((a, b) => (b.temp > a.temp ? b : a));
    const loP = points.reduce((a, b) => (b.temp < a.temp ? b : a));
    labels =
      `<circle cx="${x(hourOfDay(hiP.time)).toFixed(1)}" cy="${y(hiP.temp).toFixed(1)}" r="3" fill="#e65100"/>` +
      `<text x="${x(hourOfDay(hiP.time)).toFixed(1)}" y="${(y(hiP.temp) - 8).toFixed(1)}" font-size="12" text-anchor="middle" fill="#e65100">high ${Math.round(hiP.temp)}°</text>` +
      `<circle cx="${x(hourOfDay(loP.time)).toFixed(1)}" cy="${y(loP.temp).toFixed(1)}" r="3" fill="#0277bd"/>` +
      `<text x="${x(hourOfDay(loP.time)).toFixed(1)}" y="${(y(loP.temp) + 16).toFixed(1)}" font-size="12" text-anchor="middle" fill="#0277bd">low ${Math.round(loP.temp)}°</text>`;
  }

  const axis = `<line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#999"/>` +
               `<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#999"/>`;

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg">${axis}${ticks}${poly}${labels}</svg>`;
}

export function buildSvg(points, opts = {}) {
  const { width = 720, height = 320, pad = 40 } = opts;
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
    ? `<polyline points="${toPoly('uv')}" fill="none" stroke="#c62828" stroke-width="2"/>`
    : '<polyline points="" fill="none" stroke="#c62828"/>';
  const clearLine = points.length
    ? `<polyline points="${toPoly('uvClear')}" fill="none" stroke="#7e57c2" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.7"/>`
    : '<polyline points="" fill="none" stroke="#7e57c2"/>';

  // x ticks every 3h
  let ticks = '';
  for (let h = 0; h <= 23; h += 3) {
    ticks += `<text x="${x(h).toFixed(1)}" y="${height - pad + 16}" font-size="11" text-anchor="middle" fill="#555">${String(h).padStart(2, '0')}</text>`;
  }
  // y ticks
  for (let v = 0; v <= ceiling; v += Math.max(1, Math.round(ceiling / 6))) {
    ticks += `<text x="${pad - 8}" y="${(y(v) + 4).toFixed(1)}" font-size="11" text-anchor="end" fill="#555">${v}</text>`;
  }

  let peakLabel = '';
  if (points.length) {
    const pk = findPeak(points);
    const px = x(hourOfDay(pk.time));
    peakLabel = `<circle cx="${px.toFixed(1)}" cy="${y(pk.uv).toFixed(1)}" r="3" fill="#c62828"/>` +
      `<text x="${px.toFixed(1)}" y="${(y(pk.uv) - 8).toFixed(1)}" font-size="12" text-anchor="middle" fill="#c62828">peak ${pk.uv} @ ${hourOfDay(pk.time)}:00</text>`;
  }

  const axis = `<line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#999"/>` +
               `<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#999"/>`;

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg">${bands}${axis}${ticks}${clearLine}${uvLine}${peakLabel}</svg>`;
}

export function buildPrecipSvg(points, opts = {}) {
  const { width = 720, height = 200, pad = 40 } = opts;
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
    ? `<polyline points="${points.map((p) => `${x(hourOfDay(p.time)).toFixed(1)},${yAmt(p.amount).toFixed(1)}`).join(' ')}" fill="none" stroke="#01579b" stroke-width="1.5"/>`
    : '<polyline points="" fill="none" stroke="#01579b"/>';

  let ticks = '';
  for (let h = 0; h <= 23; h += 3) {
    ticks += `<text x="${x(h).toFixed(1)}" y="${height - pad + 16}" font-size="11" text-anchor="middle" fill="#555">${String(h).padStart(2, '0')}</text>`;
  }
  for (let p = 0; p <= 100; p += 25) {
    ticks += `<text x="${pad - 8}" y="${(yProb(p) + 4).toFixed(1)}" font-size="10" text-anchor="end" fill="#4fc3f7">${p}%</text>`;
  }
  ticks += `<text x="${width - pad + 6}" y="${(yAmt(amtTop) + 4).toFixed(1)}" font-size="10" text-anchor="start" fill="#01579b">${amtTop}"</text>` +
           `<text x="${width - pad + 6}" y="${(yAmt(0) + 4).toFixed(1)}" font-size="10" text-anchor="start" fill="#01579b">0"</text>`;

  const legend =
    `<rect x="${pad}" y="8" width="10" height="10" fill="#4fc3f7" opacity="0.6"/>` +
    `<text x="${pad + 14}" y="17" font-size="11" fill="#555">prob %</text>` +
    `<line x1="${pad + 70}" y1="13" x2="${pad + 90}" y2="13" stroke="#01579b" stroke-width="1.5"/>` +
    `<text x="${pad + 94}" y="17" font-size="11" fill="#555">amount in</text>`;

  const axis = `<line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#999"/>` +
               `<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#999"/>`;

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg">${axis}${bars}${amtLine}${ticks}${legend}</svg>`;
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
