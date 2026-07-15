export const WHO_BANDS = [
  { min: 0,  max: 3,   label: 'Low',       color: '#a8e05f' },
  { min: 3,  max: 6,   label: 'Moderate',  color: '#fdd835' },
  { min: 6,  max: 8,   label: 'High',      color: '#ff9800' },
  { min: 8,  max: 11,  label: 'Very high', color: '#f44336' },
  { min: 11, max: 100, label: 'Extreme',   color: '#9c27b0' },
];

export function filterToday(time, uv, uvClear, todayStr) {
  const out = [];
  for (let i = 0; i < time.length; i++) {
    if (typeof time[i] === 'string' && time[i].startsWith(todayStr)) {
      out.push({ time: time[i], uv: uv[i], uvClear: uvClear[i] });
    }
  }
  return out;
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
