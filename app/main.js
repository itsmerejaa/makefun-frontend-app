// app/main.js — hash router + shell (ESM, no framework)
import { listCompetitions, getCompetition, getLeaderboard, getProfile } from './api.js';
import views from './views.js';
import { slugify } from './format.js';

const NAV = [
  { href: '#/', label: 'Bounties' },
];

const THEME_KEY = 'makefun:theme';
const app = document.getElementById('app');

/* ---------- theme (localStorage guarded) ---------- */

function readTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

function writeTheme(t) {
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* storage unavailable — session-only theme */
  }
}

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
}

let theme = readTheme() || 'light';
applyTheme(theme);

function toggleTheme() {
  theme = theme === 'dark' ? 'light' : 'dark';
  applyTheme(theme);
  writeTheme(theme);
  const btn = document.getElementById('theme-btn');
  if (btn) {
    btn.textContent = theme === 'dark' ? 'terang' : 'gelap';
    btn.setAttribute('aria-pressed', String(theme === 'dark'));
  }
}

/* ---------- shell (nav + global search) ---------- */

let shellBuilt = false;

function buildShell() {
  if (shellBuilt) return;
  shellBuilt = true;

  const bar = document.createElement('header');
  bar.className = 'topbar';

  const brand = document.createElement('a');
  brand.className = 'brand';
  brand.href = '#/';
  brand.textContent = 'make.fun';

  const nav = document.createElement('nav');
  nav.className = 'topnav';
  for (const item of NAV) {
    const a = document.createElement('a');
    a.href = item.href;
    a.textContent = item.label;
    nav.append(a);
  }

  const form = document.createElement('form');
  form.className = 'search';
  const input = document.createElement('input');
  input.type = 'search';
  input.id = 'global-search';
  input.placeholder = 'cari bounty → enter';
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'pencarian global');
  form.append(input);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const s = slugify(input.value);
    if (!s) return;
    input.value = '';
    location.hash = `#/bounty/${s}`;
  });

  const themeBtn = document.createElement('button');
  themeBtn.type = 'button';
  themeBtn.id = 'theme-btn';
  themeBtn.className = 'theme-btn';
  themeBtn.textContent = theme === 'dark' ? 'terang' : 'gelap';
  themeBtn.setAttribute('aria-pressed', String(theme === 'dark'));
  themeBtn.addEventListener('click', toggleTheme);

  bar.append(brand, nav, form, themeBtn);
  document.body.insertBefore(bar, app);
}

/* ---------- router ---------- */

let loadToken = 0;

function parseRoute() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  const seg = path.split('/').filter(Boolean).map(decodeURIComponent);

  if (!seg.length) return { name: 'board' };
  if (seg[0] === 'bounty' && seg[1]) {
    if (seg[2] === 'leaderboard') return { name: 'leaderboard', slug: seg[1] };
    return { name: 'bounty', slug: seg[1] };
  }
  if (seg[0] === 'u' && seg[1]) return { name: 'profile', handle: seg[1] };
  return { name: 'notfound' };
}

function setDocTitle(t) {
  document.title = t ? `${t} · make.fun` : 'make.fun — bounties';
}

async function load(route) {
  const token = ++loadToken;
  window.__shotReady = false;

  const titles = {
    board: 'Bounties',
    bounty: null,
    leaderboard: null,
    profile: null,
    notfound: '404',
  };
  setDocTitle(titles[route.name]);

  app.replaceChildren(views.skeleton());

  try {
    let node;
    if (route.name === 'board') {
      node = views.viewBoard(await listCompetitions(24));
    } else if (route.name === 'bounty') {
      const c = await getCompetition(route.slug);
      node = views.viewBounty(c);
      setDocTitle(c?.title || route.slug);
    } else if (route.name === 'leaderboard') {
      const lb = await getLeaderboard(route.slug);
      node = views.viewLeaderboard(lb);
      setDocTitle(lb?.title || `${route.slug} — peringkat`);
    } else if (route.name === 'profile') {
      const p = await getProfile(route.handle);
      node = views.viewProfile(p);
      setDocTitle(p?.display_name || p?.handle || route.handle);
    } else {
      node = views.error('halaman tidak ditemukan');
      setDocTitle('404');
    }

    if (token !== loadToken) return; // superseded by a newer navigation
    app.replaceChildren(node);
  } catch (err) {
    if (token !== loadToken) return;
    app.replaceChildren(views.error(err && err.message ? err.message : String(err)));
  } finally {
    if (token === loadToken) window.__shotReady = true;
  }
}

function route() {
  load(parseRoute());
}

window.__shotReady = false;
buildShell();
window.addEventListener('hashchange', route);
route();
