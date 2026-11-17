// app/api.js — make.fun API client (GET only, no deps)
const BASE = 'https://make.fun';
const DEFAULT_TIMEOUT = 15000;
const DEFAULT_RETRIES = 3;

/** url -> { etag, data } */
const cache = new Map();

export class HttpError extends Error {
  constructor(status, statusText, url) {
    super(`HTTP ${status} ${statusText || ''}`.trim() + ` — ${url}`);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The AbortController of the most recent in-flight request (module-level). */
let lastController = null;

/**
 * Abort the request currently in flight, if any. Pending retries wake up and
 * throw AbortError; the next fetchJSON call installs a fresh controller.
 */
export function cancelPending() {
  const c = lastController;
  lastController = null;
  if (c) {
    try {
      c.abort();
    } catch {
      /* already settled */
    }
  }
}

/** Full, normalized cache key: absolute URLs are canonicalized by URL.href. */
function cacheKey(url) {
  const s = String(url);
  try {
    return new URL(s, BASE).href;
  } catch {
    return s;
  }
}

function retryAfterMs(res, fallback) {
  const h = res.headers.get('Retry-After');
  if (!h) return fallback;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const when = Date.parse(h);
  return Number.isFinite(when) ? Math.max(0, when - Date.now()) : fallback;
}

/**
 * GET JSON with in-memory cache, ETag revalidation, AbortController timeout
 * and exponential-backoff retries (network errors, 5xx, 429).
 */
export async function fetchJSON(url, { retries = DEFAULT_RETRIES, timeout = DEFAULT_TIMEOUT } = {}) {
  const key = cacheKey(url);
  const hit = cache.get(key);
  let attempt = 0;
  let delay = 300;

  for (;;) {
    const ctrl = new AbortController();
    lastController = ctrl;
    const timer = setTimeout(() => ctrl.abort(), timeout);

    try {
      const headers = { Accept: 'application/json' };
      if (hit && hit.etag) headers['If-None-Match'] = hit.etag;

      const res = await fetch(key, {
        method: 'GET',
        headers,
        signal: ctrl.signal,
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'follow',
      });

      if (res.status === 304 && hit) return hit.data;

      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && attempt < retries && res.status !== 403) {
          attempt++;
          const wait = res.status === 429 ? retryAfterMs(res, delay) : delay;
          await sleep(wait);
          delay *= 2;
          continue;
        }
        throw new HttpError(res.status, res.statusText, key);
      }

      const data = await res.json();
      cache.set(key, { etag: res.headers.get('ETag') || null, data });
      return data;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (attempt < retries) {
        attempt++;
        await sleep(delay);
        delay *= 2;
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
      if (lastController === ctrl) lastController = null;
    }
  }
}

export function clearCache(url) {
  if (url === undefined) cache.clear();
  else cache.delete(cacheKey(url));
}

const enc = encodeURIComponent;

export function listCompetitions(limit = 24) {
  const n = Math.max(1, Math.min(100, Math.trunc(Number(limit) || 24)));
  return fetchJSON(`${BASE}/api/competitions?limit=${n}`);
}

export function getCompetition(slug) {
  return fetchJSON(`${BASE}/api/competitions/${enc(String(slug))}`);
}

export function getLeaderboard(slug) {
  return fetchJSON(`${BASE}/api/competitions/${enc(String(slug))}/leaderboard`);
}

export function getProfile(handle) {
  return fetchJSON(`${BASE}/api/profiles/${enc(String(handle))}`);
}
