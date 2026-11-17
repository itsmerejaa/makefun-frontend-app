// Pure formatting helpers -- no DOM, no fetch, no side effects.

const HOUR = 3600000;
const DAY = 24 * HOUR;

/** $1,234.56 · $12.5K is NOT used here -- exact USD with adaptive decimals. */
export function usd(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '$0';
  const abs = Math.abs(v);
  const decimals = abs > 0 && abs < 1 ? 2 : abs < 10000 ? (abs % 1 === 0 ? 0 : 2) : 2;
  return (
    '$' +
    v.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: abs < 10000 ? decimals : 0,
    })
  );
}

/** 1234 -> "1.2K", 2500000 -> "2.5M" */
export function compactNum(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  const trim = (x) => (x >= 10 || x % 1 === 0 ? x.toFixed(0) : x.toFixed(1));
  if (abs >= 1e9) return sign + trim(abs / 1e9) + 'B';
  if (abs >= 1e6) return sign + trim(abs / 1e6) + 'M';
  if (abs >= 1e3) return sign + trim(abs / 1e3) + 'K';
  return sign + String(Math.round(abs * 100) / 100);
}

/** Parse an ISO date / ms epoch / Date into ms, or null. */
function toMs(v) {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : t;
}

/**
 * { open: bool, text: '3h 12m' }
 * open is decided by comparing the deadline against Date.now() -- never a
 * server-supplied status string.
 */
export function timeLeft(deadline, now = Date.now()) {
  const t = toMs(deadline);
  if (t == null) return { open: false, text: 'Closed' };

  const ms = t - now;
  if (ms <= 0) return { open: false, text: 'Closed' };

  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  const m = Math.floor((ms % HOUR) / 60000);

  if (d >= 1) return { open: true, text: `${d}d ${h}h` };
  if (h >= 1) return { open: true, text: `${h}h ${m}m` };
  if (m >= 1) return { open: true, text: `${m}m` };
  return { open: true, text: '<1m' };
}

/** Back-compat / sugar wrapper over timeLeft. */
export function isStillOpen(deadline, now = Date.now()) {
  return timeLeft(deadline, now).open;
}

/** 0.0734 or 7.34 -> "7.3%" (accepts ratio or already-percent input). */
export function pct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0%';
  const p = Math.abs(v) <= 1 ? v * 100 : v;
  const trimmed = Math.round(p * 10) / 10;
  return `${Number.isInteger(trimmed) ? trimmed.toFixed(0) : trimmed.toFixed(1)}%`;
}

/** ISO -> "Mar 4, 2026" in the viewer's locale; '' when unparseable. */
export function localDate(iso) {
  const t = toMs(iso);
  if (t == null) return '';
  return new Date(t).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** "Hello World!! 2026" -> "hello-world-2026" */
export function slugify(s) {
  return String(s == null ? '' : s)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default {
  usd,
  compactNum,
  timeLeft,
  isStillOpen,
  pct,
  localDate,
  slugify,
};
