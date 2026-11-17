// Hash router + shell (nav, global search, theme). No framework, no innerHTML.

import { listCompetitions, getCompetition, getLeaderboard, getProfile, cancelPending } from './api.js';
import { viewBoard, viewBounty, viewLeaderboard, viewProfile, skeleton, error } from './views.js';
import { slugify } from './format.js';

const THEME_KEY = 'makefun.theme';
let appEl = null;
let renderToken = 0;

/* ------------------------------------------------------------------ routing */

/** '#/bounty/x/leaderboard' -> {name:'leaderboard', slug:'x'} */
function parseHash(raw) {
  const hash = String(raw || '').replace(/^#/, '');
  const parts = hash.split('/').filter(Boolean).map(decodeURIComponent);

  if (parts.length === 0) return { name: 'board' };
  if (parts[0] === 'bounty' && parts.length === 2) return { name: 'bounty', slug: parts[1] };
  if (parts[0] === 'bounty' && parts.length === 3 && parts[2] === 'leaderboard') {
    return { name: 'leaderboard', slug: parts[1] };
  }
  if (parts[0] === 'u' && parts.length === 2) return { name: 'profile', handle: parts[1] };
  return { name: 'notfound', raw: hash };
}

const TITLES = {
  board: 'Bounty',
  bounty: 'Bounty',
  leaderboard: 'Papan peringkat',
  profile: 'Profil',
  notfound: 'Tidak ditemukan',
};

function setTitle(extra) {
  document.title = extra ? extra + ' · make.fun' : 'make.fun · bounty';
}

/* --------------------------------------------------------------- DOM shell */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

function link(href, className, text) {
  const a = el('a', className, text);
  a.href = href;
  return a;
}

function buildNav() {
  const nav = el('header', 'topbar');
  const brand = link('#/', 'brand', 'make.fun');
  nav.appendChild(brand);

  const links = el('nav', 'topnav');
  links.appendChild(link('#/', 'nav-link', 'Bounty'));
  nav.appendChild(links);

  const form = el('form', 'search-form');
  const input = el('input', 'search-input');
  input.type = 'search';
  input.placeholder = 'cari bounty…';
  input.setAttribute('aria-label', 'Cari bounty');
  const submit = el('button', 'btn btn-search', 'cari');
  submit.type = 'submit';
  form.append(input, submit);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    navigate('#/bounty/' + encodeURIComponent(slugify(q)));
  });
  nav.appendChild(form);

  const toggle = el('button', 'btn btn-theme', 'tema');
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'Ganti tema gelap/terang');
  toggle.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });
  nav.appendChild(toggle);

  return nav;
}

/* ------------------------------------------------------------------- theme */

function readStored() {
  try {
    return window.localStorage.getItem(THEME_KEY);
  } catch (err) {
    return null;
  }
}

function writeStored(value) {
  try {
    window.localStorage.setItem(THEME_KEY, value);
  } catch (err) {
    /* private mode / disabled storage: theme just isn't persisted */
  }
}

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  writeStored(next);
}

/* ------------------------------------------------------------------ render */

function navigate(hash) {
  if (window.location.hash === hash) route();
  else window.location.hash = hash;
}

function swap(node) {
  if (!appEl) return;
  appEl.replaceChildren(node);
}

async function render(route) {
  switch (route.name) {
    case 'board': {
      const data = await listCompetitions(24);
      if (!data) throw new Error('gagal memuat daftar bounty');
      setTitle('Bounty');
      return viewBoard(data);
    }
    case 'bounty': {
      const c = await getCompetition(route.slug);
      if (!c) throw new Error('bounty tidak ditemukan: ' + route.slug);
      setTitle(c.title || route.slug);
      return viewBounty(c);
    }
    case 'leaderboard': {
      const lb = await getLeaderboard(route.slug);
      if (!lb) throw new Error('papan peringkat tidak tersedia: ' + route.slug);
      setTitle(lb.title || (lb.competition && lb.competition.title) || route.slug);
      return viewLeaderboard(lb);
    }
    case 'profile': {
      const p = await getProfile(route.handle);
      if (!p) throw new Error('profil tidak ditemukan: ' + route.handle);
      setTitle(p.display_name || p.handle || route.handle);
      return viewProfile(p);
    }
    default:
      setTitle('Tidak ditemukan');
      return error('rute tidak dikenal: ' + (route.raw || ''));
  }
}

async function route() {
  const token = ++renderToken;
  const parsed = parseHash(window.location.hash);

  // The previous route's request is now pointless: abort it so a slow response
  // can never land on top of the view we are about to render.
  cancelPending();

  window.__shotReady = false;
  swap(skeleton());

  let node;
  try {
    node = await render(parsed);
  } catch (err) {
    console.warn('[main] route gagal', err);
    setTitle('gagal memuat');
    node = error((err && err.message) || 'terjadi kesalahan');
  }

  if (token !== renderToken) return; // a newer navigation won
  swap(node);
  window.__shotReady = true;
}

/* -------------------------------------------------------------------- boot */

function boot() {
  appEl = document.getElementById('app');

  // Theme before first paint of app content; prefers-color-scheme as default.
  const stored = readStored();
  if (stored === 'dark' || stored === 'light') applyTheme(stored);
  else {
    const prefersDark =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }

  if (appEl) appEl.before(buildNav());

  window.addEventListener('hashchange', route);
  if (!window.location.hash) window.location.replace('#/');
  route();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
