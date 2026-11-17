// DOM views -- ESM, no framework. createElement/textContent only:
// no innerHTML is ever fed API data (or anything else).

import { usd, compactNum, timeLeft, isStillOpen, localDate } from './format.js';

/* ---------------------------------------------------------------- primitives */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

function frag() {
  return document.createDocumentFragment();
}

function link(href, className, text) {
  const a = el('a', className, text);
  a.href = href;
  return a;
}

/**
 * Render any value (object / array / number / string / null) without ever
 * handing it to innerHTML.
 */
function renderAny(value, depth = 0) {
  if (value == null) return el('span', 'val val-empty', '—');
  const type = typeof value;
  if (type === 'number') return el('span', 'val val-num', Number.isFinite(value) ? String(value) : '—');
  if (type === 'boolean') return el('span', 'val val-bool', value ? 'ya' : 'tidak');
  if (type === 'string') return el('span', 'val val-str', value);
  if (type === 'function') return el('span', 'val val-empty', '—');

  if (Array.isArray(value)) {
    if (!value.length) return el('span', 'val val-empty', '—');
    const list = el(depth === 0 ? 'ul' : 'ul', 'val val-list');
    for (const item of value) {
      const li = el('li');
      li.appendChild(renderAny(item, depth + 1));
      list.appendChild(li);
    }
    return list;
  }

  const keys = Object.keys(value);
  if (!keys.length) return el('span', 'val val-empty', '—');
  const dl = el('dl', 'val val-obj');
  for (const k of keys) {
    dl.appendChild(el('dt', 'val-key', k));
    const dd = el('dd');
    dd.appendChild(renderAny(value[k], depth + 1));
    dl.appendChild(dd);
  }
  return dl;
}

function statePill(open) {
  return el('span', 'pill ' + (open ? 'pill-open' : 'pill-closed'), open ? 'masih buka' : 'ditutup');
}

function money(n) {
  return (Number(n) || 0) > 0 ? usd(n) : 'gratis';
}

/* -------------------------------------------------------------------- board */

export function viewBoard(data) {
  const items = Array.isArray(data && data.items) ? data.items.slice() : [];
  const root = el('section', 'view view-board');

  const head = el('header', 'board-head');
  head.appendChild(el('h1', 'view-title', 'Bounty'));

  const tools = el('div', 'board-tools');
  const search = el('input', 'search');
  search.type = 'search';
  search.placeholder = 'cari bounty…';
  search.setAttribute('aria-label', 'Cari bounty');

  const sort = el('select', 'sort');
  sort.setAttribute('aria-label', 'Urutkan');
  for (const [value, label] of [
    ['pot', 'Pot'],
    ['time', 'Sisa waktu'],
    ['entries', 'Entri'],
  ]) {
    const opt = el('option', null, label);
    opt.value = value;
    sort.appendChild(opt);
  }
  sort.value = 'pot';

  const count = el('span', 'board-count');
  tools.append(search, sort, count);
  head.appendChild(tools);
  root.appendChild(head);

  const list = el('div', 'board-list');
  root.appendChild(list);

  if (!items.length) {
    list.appendChild(el('p', 'empty', 'belum ada bounty'));
    count.textContent = '0 bounty';
    return root;
  }

  const cards = items.map((item) => {
    const open = isStillOpen(item.deadline);
    const card = el('article', 'card card-bounty');
    card.__open = open;
    card.__pot = Number(item.rewardAmount) || 0;
    card.__time = (() => {
      const t = Date.parse(item.deadline);
      return Number.isNaN(t) ? Infinity : t; // sooner deadline sorts first
    })();
    card.__entries = Number(item.submissionCount) || 0;
    card.__haystack = [item.title, item.category, item.sponsor && item.sponsor.name, (item.skills || []).join(' ')]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const slug = item.slug || '';
    const titleLink = link('#/bounty/' + encodeURIComponent(slug), 'card-title', item.title || slug || 'tanpa judul');
    card.appendChild(titleLink);

    const meta = el('div', 'card-meta');
    if (item.category) meta.appendChild(el('span', 'tag tag-cat', item.category));
    if (item.sponsor && item.sponsor.name) {
      const sp = el('span', 'tag tag-sponsor', item.sponsor.name);
      if (item.sponsor.isVerified) sp.appendChild(el('span', 'verified', ' ✓'));
      meta.appendChild(sp);
    }
    meta.appendChild(statePill(open));
    card.appendChild(meta);

    const stats = el('div', 'card-stats');
    stats.appendChild(stat('pot', usd(item.rewardAmount)));
    stats.appendChild(stat('entry fee', money(item.entryFeeUsd)));
    stats.appendChild(stat('sisa', timeLeft(item.deadline).text));
    stats.appendChild(stat('entri', compactNum(item.submissionCount)));
    card.appendChild(stats);

    return card;
  });

  for (const c of cards) list.appendChild(c);

  function apply() {
    const q = search.value.trim().toLowerCase();
    const mode = sort.value;
    let shown = 0;
    for (const c of cards) {
      const hit = !q || c.__haystack.includes(q);
      c.hidden = !hit;
      if (hit) shown++;
    }
    count.textContent = shown + ' bounty';

    const sorted = cards.slice().sort((a, b) => {
      if (mode === 'time') return a.__time - b.__time;
      if (mode === 'entries') return b.__entries - a.__entries;
      return b.__pot - a.__pot;
    });
    // Reorder DOM: moving hidden nodes too keeps filter/sort independent.
    for (const c of sorted) list.appendChild(c);
  }

  search.addEventListener('input', apply);
  sort.addEventListener('change', apply);
  apply();

  return root;
}

function stat(label, value) {
  const wrap = el('div', 'stat');
  wrap.appendChild(el('span', 'stat-label', label));
  wrap.appendChild(el('span', 'stat-value', value));
  return wrap;
}

/* ------------------------------------------------------------------ bounty */

export function viewBounty(c) {
  const root = el('section', 'view view-bounty');
  const data = c || {};
  const slug = data.slug || '';
  const open = isStillOpen(data.deadline);

  const head = el('header', 'bounty-head');
  head.appendChild(el('h1', 'view-title', data.title || slug || 'Bounty'));
  if (data.sponsor && data.sponsor.name) {
    const sp = el('p', 'bounty-sponsor', data.sponsor.name);
    if (data.sponsor.slug) {
      sp.textContent = '';
      sp.appendChild(link('#/u/' + encodeURIComponent(data.sponsor.slug), 'sponsor-link', data.sponsor.name));
    }
    if (data.sponsor.isVerified) sp.appendChild(el('span', 'verified', ' ✓ terverifikasi'));
    head.appendChild(sp);
  }
  head.appendChild(statePill(open));
  root.appendChild(head);

  const meta = el('div', 'bounty-meta');
  if (data.category) meta.appendChild(el('span', 'tag tag-cat', data.category));
  for (const s of Array.isArray(data.skills) ? data.skills : []) {
    meta.appendChild(el('span', 'tag tag-skill', s));
  }
  root.appendChild(meta);

  const stats = el('div', 'card-stats bounty-stats');
  stats.appendChild(stat('pot', usd(data.rewardAmount)));
  stats.appendChild(stat('entry fee', money(data.entryFeeUsd)));
  stats.appendChild(stat('sisa waktu', timeLeft(data.deadline).text));
  stats.appendChild(stat('entri', compactNum(data.submissionCount)));
  root.appendChild(stats);

  if (data.description) {
    const desc = el('section', 'bounty-desc');
    desc.appendChild(el('h2', 'section-title', 'Deskripsi'));
    const text = String(data.description);
    for (const para of text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
      desc.appendChild(el('p', 'para', para));
    }
    root.appendChild(desc);
  }

  const rewards = data.rewards && typeof data.rewards === 'object' ? data.rewards : null;
  if (rewards && Object.keys(rewards).length) {
    const section = el('section', 'bounty-rewards');
    section.appendChild(el('h2', 'section-title', 'Hadiah'));
    const table = el('table', 'table table-rewards');
    const thead = el('thead');
    const hr = el('tr');
    hr.appendChild(el('th', null, 'peringkat'));
    hr.appendChild(el('th', null, 'hadiah'));
    thead.appendChild(hr);
    table.appendChild(thead);
    const tbody = el('tbody');
    const rows = Object.keys(rewards)
      .map((k) => [k, rewards[k]])
      .sort((a, b) => (Number(a[0]) || 0) - (Number(b[0]) || 0));
    for (const [place, amount] of rows) {
      const tr = el('tr');
      tr.appendChild(el('td', null, '#' + place));
      tr.appendChild(el('td', null, usd(amount)));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    section.appendChild(table);
    root.appendChild(section);
  }

  const dates = el('dl', 'dates');
  dates.appendChild(el('dt', null, 'dibuka'));
  dates.appendChild(el('dd', null, localDate(data.publishedAt) || '—'));
  dates.appendChild(el('dt', null, 'tenggat'));
  dates.appendChild(el('dd', null, localDate(data.deadline) || '—'));
  dates.appendChild(el('dt', null, 'status'));
  dates.appendChild(el('dd', null, open ? 'buka' : 'tutup'));
  root.appendChild(dates);

  if (slug) {
    const nav = el('nav', 'bounty-actions');
    nav.appendChild(link('#/bounty/' + encodeURIComponent(slug) + '/leaderboard', 'btn', 'Papan peringkat →'));
    if (data.url) {
      const ext = link(data.url, 'btn btn-ghost', 'Halaman asli ↗');
      ext.rel = 'noopener';
      nav.appendChild(ext);
    }
    root.appendChild(nav);
  }

  return root;
}

/* ------------------------------------------------------------- leaderboard */

export function viewLeaderboard(lb) {
  const root = el('section', 'view view-leaderboard');
  const data = lb || {};
  const comp = data.competition || {};
  const slug = comp.slug || '';
  const entries = Array.isArray(data.entries) ? data.entries : [];
  const hasValues = entries.some((e) => e && e.values != null);
  const hasCost = entries.some((e) => e && e.cost != null);

  const head = el('header', 'lb-head');
  head.appendChild(el('h1', 'view-title', data.title || comp.title || 'Papan peringkat'));
  if (slug) {
    head.appendChild(link('#/bounty/' + encodeURIComponent(slug), 'breadcrumb', '← ' + (comp.title || slug)));
  }
  root.appendChild(head);

  const stats = el('div', 'card-stats');
  if (comp.status) stats.appendChild(stat('status', comp.status));
  stats.appendChild(stat('entri', compactNum(entries.length)));
  if (data.phase && data.phase.title) stats.appendChild(stat('fase', data.phase.title));
  root.appendChild(stats);

  if (data.metrics_withheld) {
    root.appendChild(el('p', 'notice', 'sebagian metrik ditahan'));
  }

  if (!entries.length) {
    root.appendChild(el('p', 'empty', 'belum ada entri'));
    return root;
  }

  const table = el('table', 'table table-lb');
  const thead = el('thead');
  const hr = el('tr');
  for (const [label, cls] of [
    ['#', 'col-rank'],
    ['handle', 'col-handle'],
    ['judul', 'col-title'],
    ['nilai', 'col-values'],
    ['cost', 'col-cost'],
  ]) {
    if (label === 'cost' && !hasCost) continue;
    hr.appendChild(el('th', cls, label));
  }
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = el('tbody');
  for (const e of entries) {
    const row = e || {};
    const tr = el('tr', 'row' + (row.compliant === false ? ' row-flagged' : ''));

    tr.appendChild(el('td', 'col-rank', row.rank != null ? String(row.rank) : '—'));

    const handleCell = el('td', 'col-handle');
    if (row.handle) handleCell.appendChild(link('#/u/' + encodeURIComponent(row.handle), 'handle-link', row.handle));
    else handleCell.textContent = '—';
    tr.appendChild(handleCell);

    const titleCell = el('td', 'col-title');
    if (row.origin_url && row.title) {
      const a = link(row.origin_url, 'entry-link', row.title);
      a.rel = 'noopener';
      titleCell.appendChild(a);
    } else {
      titleCell.textContent = row.title || '—';
    }
    tr.appendChild(titleCell);

    const valueCell = el('td', 'col-values');
    if (hasValues) valueCell.appendChild(renderAny(row.values));
    else valueCell.textContent = '—';
    tr.appendChild(valueCell);

    if (hasCost) {
      const costCell = el('td', 'col-cost');
      costCell.appendChild(renderAny(row.cost));
      tr.appendChild(costCell);
    }

    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  root.appendChild(table);

  return root;
}

/* ----------------------------------------------------------------- profile */

export function viewProfile(p) {
  const root = el('section', 'view view-profile');
  const data = p || {};

  const head = el('header', 'profile-head');
  const imgSrc = data.avatar || data.image;
  if (imgSrc) {
    const img = el('img', 'avatar');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = data.display_name || data.handle || 'avatar';
    img.width = 96;
    img.height = 96;
    img.crossOrigin = 'anonymous'; // before src, or the CORS flag is ignored
    img.src = imgSrc;
    head.appendChild(img);
  }
  const ident = el('div', 'profile-ident');
  ident.appendChild(el('h1', 'view-title', data.display_name || data.handle || 'Profil'));
  if (data.handle) ident.appendChild(el('p', 'profile-handle', '@' + data.handle));
  if (data.github_login) {
    const gh = el('p', 'profile-github');
    gh.appendChild(link('https://github.com/' + encodeURIComponent(data.github_login), 'gh-link', 'github: ' + data.github_login));
    ident.appendChild(gh);
  }
  if (data.joined_at) ident.appendChild(el('p', 'profile-joined', 'bergabung ' + localDate(data.joined_at)));
  head.appendChild(ident);
  root.appendChild(head);

  if (data.bio) {
    const bio = el('section', 'profile-bio');
    for (const para of String(data.bio).split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)) {
      bio.appendChild(el('p', 'para', para));
    }
    root.appendChild(bio);
  }

  for (const key of ['record', 'solutions', 'payouts']) {
    const value = data[key];
    if (value == null) continue;
    if (Array.isArray(value) && !value.length) continue;
    if (typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length) continue;
    const section = el('section', 'profile-section');
    section.appendChild(el('h2', 'section-title', key));
    section.appendChild(renderAny(value));
    root.appendChild(section);
  }

  if (data.profile_url) {
    const nav = el('nav', 'profile-actions');
    const a = link(data.profile_url, 'btn btn-ghost', 'Profil asli ↗');
    a.rel = 'noopener';
    nav.appendChild(a);
    root.appendChild(nav);
  }

  return root;
}

/* ------------------------------------------------------- loading / failure */

export function skeleton() {
  const root = el('section', 'view view-skeleton');
  for (let i = 0; i < 4; i++) {
    const card = el('div', 'skel-card');
    card.appendChild(el('div', 'skel skel-title'));
    card.appendChild(el('div', 'skel skel-line'));
    card.appendChild(el('div', 'skel skel-line skel-short'));
    root.appendChild(card);
  }
  root.setAttribute('aria-busy', 'true');
  return root;
}

export function error(msg) {
  const root = el('section', 'view view-error');
  root.setAttribute('role', 'alert');
  root.appendChild(el('h2', 'error-title', 'gagal memuat'));
  root.appendChild(el('p', 'error-msg', msg ? String(msg) : 'Terjadi kesalahan.'));
  const retry = el('button', 'btn', 'coba lagi');
  retry.type = 'button';
  retry.addEventListener('click', () => window.location.reload());
  root.appendChild(retry);
  return root;
}

export default { viewBoard, viewBounty, viewLeaderboard, viewProfile, skeleton, error };
