// make.fun API client -- GET-only, no libraries.
// In-memory cache + ETag/If-None-Match (revalidates only within the same minute),
// AbortController timeouts, 3 retries with exponential backoff, and module-level
// cancellation of the in-flight request when the route changes.

const ORIGIN = 'https://make.fun';
const TIMEOUT_MS = 10000;
const RETRIES = 3;

/** canonical absolute URL -> { body, etag, at } */
const cache = new Map();

/** The newest in-flight controller, so cancelPending() can abort it. */
let pending = null;

const minuteOf = (t) => Math.floor(t / 60000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Canonical absolute URL for anything the app asks for: relative paths resolve
 * against the make.fun origin, anything off-origin is refused. This one form is
 * the cache key, so `/api/x` and the full URL never become two entries.
 */
function normalizeUrl(url) {
  if (typeof url !== 'string' || !url) return null;
  let full;
  try {
    full = new URL(url, ORIGIN + '/').href;
  } catch (err) {
    return null;
  }
  if (full !== ORIGIN + '/' && !full.startsWith(ORIGIN + '/')) return null;
  return full;
}

/**
 * Abort the request the current route started, because a hashchange moved us
 * somewhere else. Returns true when something was actually cancelled.
 */
export function cancelPending() {
  if (!pending) return false;
  const ctrl = pending;
  pending = null;
  try {
    ctrl.abort();
  } catch (err) {
    /* already settled */
  }
  return true;
}

/** Forget one URL's cached body, or all of them when called with nothing. */
export function clearCache(url) {
  if (url == null) {
    cache.clear();
    return;
  }
  const full = normalizeUrl(url);
  if (full) cache.delete(full);
}

async function once(fullUrl, ctrl, cached) {
  const headers = { Accept: 'application/json' };

  // Only send a conditional request while the cached copy is from this minute;
  // after that we want a fresh body even if the server would answer 304.
  const revalidating = !!cached && minuteOf(cached.at) === minuteOf(Date.now());
  if (revalidating && cached.etag) headers['If-None-Match'] = cached.etag;

  const res = await fetch(fullUrl, {
    method: 'GET',
    headers,
    signal: ctrl.signal,
    credentials: 'omit',
    cache: 'no-store',
  });

  if (res.status === 304 && cached) return cached.body;

  if (res.status >= 500 || res.status === 429) {
    const err = new Error(`HTTP ${res.status}`);
    err.retryable = true;
    throw err;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const body = await res.json();
  cache.set(fullUrl, { body, etag: res.headers.get('ETag') || null, at: Date.now() });
  return body;
}

/**
 * GET a JSON document from make.fun.
 * Returns the raw parsed body; resolves to null on any failure (abort included).
 */
export async function fetchJSON(url, opts = {}) {
  const fullUrl = normalizeUrl(url);
  if (!fullUrl) return null;

  const cached = opts.force ? null : cache.get(fullUrl);
  let lastError = null;

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const ctrl = new AbortController();
    pending = ctrl;
    const isNewest = () => pending === ctrl;
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    try {
      const body = await once(fullUrl, ctrl, cached);
      if (isNewest()) pending = null;
      return body;
    } catch (err) {
      lastError = err;
      if (isNewest()) pending = null;
      // An abort is either navigation teardown or the per-request timeout:
      // retrying it would fight the thing that asked us to stop.
      if (err && err.name === 'AbortError') break;
      if (attempt === RETRIES || (err && err.retryable === false)) break;
      const backoff = 300 * 2 ** attempt + Math.random() * 100;
      await sleep(backoff);
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastError && lastError.name !== 'AbortError') {
    console.warn('[api] ' + fullUrl, lastError.message || lastError);
  }
  // Stale-while-error: a previous good body beats nothing at all.
  return cached ? cached.body : null;
}

const enc = (s) => encodeURIComponent(String(s == null ? '' : s));

/** Raw list payload: { items, next_cursor } or null. */
export async function listCompetitions(limit = 24) {
  const n = Number.isFinite(+limit) && +limit > 0 ? Math.floor(+limit) : 24;
  return fetchJSON(`${ORIGIN}/api/competitions?limit=${n}`);
}

/** Raw bounty object or null. */
export async function getCompetition(slug) {
  if (!slug) return null;
  return fetchJSON(`${ORIGIN}/api/competitions/${enc(slug)}`);
}

/** Raw leaderboard object or null. */
export async function getLeaderboard(slug) {
  if (!slug) return null;
  return fetchJSON(`${ORIGIN}/api/competitions/${enc(slug)}/leaderboard`);
}

/** Raw profile object or null. */
export async function getProfile(handle) {
  if (!handle) return null;
  return fetchJSON(`${ORIGIN}/api/profiles/${enc(handle)}`);
}

export default {
  fetchJSON,
  listCompetitions,
  getCompetition,
  getLeaderboard,
  getProfile,
  cancelPending,
  clearCache,
};
