// app/format.js — pure formatters (no deps, no DOM)
const DASH = '—';

function num(n) {
  if (n === null || n === undefined) return null;
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? v : null;
}

export function usd(n) {
  const v = num(n);
  if (v === null) return DASH;
  const abs = Math.abs(v);
  const frac = abs > 0 && abs < 1 ? 2 : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: frac,
    maximumFractionDigits: frac,
  }).format(v);
}

export function compactNum(n) {
  const v = num(n);
  if (v === null) return DASH;
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  const unit = (d, suffix) => {
    const x = a / d;
    const s = x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2);
    return sign + s.replace(/\.?0+$/, '') + suffix;
  };
  if (a >= 1e12) return unit(1e12, 'T');
  if (a >= 1e9) return unit(1e9, 'B');
  if (a >= 1e6) return unit(1e6, 'M');
  if (a >= 1e3) return unit(1e3, 'K');
  return sign + String(Math.round(a * 100) / 100);
}

export function timeLeft(deadline) {
  const t = deadline ? Date.parse(deadline) : NaN;
  if (!Number.isFinite(t)) return { open: true, text: '' };
  const ms = t - Date.now();
  if (ms <= 0) return { open: false, text: 'ended' };

  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;

  let text;
  if (d > 0) text = `${d}d ${h}h`;
  else if (h > 0) text = `${h}h ${m}m`;
  else if (m > 0) text = `${m}m`;
  else text = '<1m';
  return { open: true, text };
}

/** Fraction (0..1) or already-percent (>1) -> percent string. */
export function pct(n) {
  const v = num(n);
  if (v === null) return DASH;
  const p = Math.abs(v) > 1 ? v : v * 100;
  const r = Math.round(p * 10) / 10;
  return `${r}%`;
}

export function localDate(iso) {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return DASH;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(t));
}

/** Open/closed from the deadline itself — never from a status field. */
export function isStillOpen(deadline) {
  if (!deadline) return true; // no deadline => not ended
  const t = Date.parse(deadline);
  if (!Number.isFinite(t)) return true;
  return t > Date.now();
}

export function slugify(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
