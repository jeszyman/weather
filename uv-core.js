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
