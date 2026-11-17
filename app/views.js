// app/views.js — DOM views (ESM, no framework, no innerHTML for API data)
import { usd, compactNum, timeLeft, pct, localDate, isStillOpen, slugify } from './format.js';

/* ---------- tiny element helpers ---------- */

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = String(v);
    else if (k === 'href') n.setAttribute('href', String(v));
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    n.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return n;
}

const STRINGS = ['string', 'number', 'boolean'];
const DASH = '—';
const txt = (v) => (v === null || v === undefined || v === '' ? DASH : String(v));
const hash = (p) => `#${p}`;
const bountyLink = (slug) => hash(`/bounty/${encodeURIComponent(slug)}`);

/** safe textual rendering of any JSON-ish value */
function anyValue(v) {
  if (v === null || v === undefined || v === '') return txt(v);
  if (STRINGS.includes(typeof v)) return String(v);
  if (Array.isArray(v)) return v.map(anyValue).join(', ');
  return Object.entries(v).map(([k, x]) => `${k}: ${anyValue(x)}`).join(' · ');
}

function kvList(obj) {
  const list = el('dl', { class: 'kv' });
  if (!obj || typeof obj !== 'object') {
    list.append(el('dd', { text: txt(obj) }));
    return list;
  }
  for (const [k, v] of Object.entries(obj)) {
    list.append(el('dt', { text: k }), el('dd', { text: anyValue(v) }));
  }
  if (!list.childNodes.length) list.append(el('dd', { text: DASH }));
  return list;
}

function sponsorName(sp) {
  if (!sp) return DASH;
  return txt(sp.name || sp.slug);
}

function skillsOf(c) {
  return Array.isArray(c.skills) ? c.skills.filter(Boolean) : [];
}

function rewardsRows(rewards) {
  const rows = [];
  if (Array.isArray(rewards)) {
    rewards.forEach((v, i) => rows.push([i + 1, v]));
  } else if (rewards && typeof rewards === 'object') {
    for (const k of Object.keys(rewards).sort((a, b) => Number(a) - Number(b))) rows.push([k, rewards[k]]);
  }
  return rows;
}

function deadlineMs(c) {
  const t = Date.parse(c?.deadline ?? '');
  return Number.isFinite(t) ? t : Infinity;
}

function openBadge(c) {
  const open = isStillOpen(c?.deadline);
  return el('span', { class: `badge ${open ? 'open' : 'closed'}`, text: open ? 'open' : 'ended' });
}

/* ---------- viewBoard ---------- */

export function viewBoard(data) {
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  const wrap = el('section', { class: 'board' });

  wrap.append(el('h1', { class: 'board-title', text: 'Bounties' }));

  const search = el('input', {
    type: 'search',
    class: 'board-search',
    placeholder: 'cari bounty, sponsor, skill…',
    autocomplete: 'off',
  });
  const sort = el(
    'select',
    { class: 'board-sort' },
    el('option', { value: 'pot', text: 'pot tertinggi' }),
    el('option', { value: 'time', text: 'sisa waktu' }),
    el('option', { value: 'entries', text: 'entri terbanyak' }),
  );

  const grid = el('div', { class: 'board-grid' });
  const count = el('p', { class: 'board-count' });
  wrap.append(el('div', { class: 'board-controls' }, search, sort), count, grid);

  const cards = items.map((c) => ({ c, node: boardCard(c) }));
  const haystack = new Map(
    items.map((c) => [
      c,
      [c.slug, c.title, c.category, c.description, c.sponsor?.name, c.sponsor?.slug, ...skillsOf(c)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    ]),
  );

  function render() {
    const q = slugify(search.value.trim()).replace(/-/g, ' ');
    const raw = search.value.trim().toLowerCase();
    const filtered = cards.filter(({ c }) => !raw || haystack.get(c).includes(raw) || haystack.get(c).includes(q));

    const mode = sort.value;
    filtered.sort((a, b) => {
      if (mode === 'entries') return (b.c.submissionCount || 0) - (a.c.submissionCount || 0);
      if (mode === 'time') {
        const ao = isStillOpen(a.c.deadline), bo = isStillOpen(b.c.deadline);
        if (ao !== bo) return ao ? -1 : 1;
        return deadlineMs(a.c) - deadlineMs(b.c);
      }
      return (Number(b.c.rewardAmount) || 0) - (Number(a.c.rewardAmount) || 0);
    });

    grid.replaceChildren(...filtered.map((f) => f.node));
    count.textContent = `${filtered.length} / ${items.length} bounty`;
    if (!filtered.length) grid.append(el('p', { class: 'empty', text: 'tidak ada bounty cocok' }));
  }

  search.addEventListener('input', render);
  sort.addEventListener('change', render);
  render();
  return wrap;
}

function boardCard(c) {
  const open = isStillOpen(c.deadline);
  const card = el('article', { class: `card ${open ? 'is-open' : 'is-closed'}` });

  const title = el('a', { class: 'card-title', href: bountyLink(c.slug), text: txt(c.title || c.slug) });
  card.append(
    el('header', { class: 'card-head' }, title, openBadge(c)),
    el(
      'p',
      { class: 'card-meta' },
      el('span', { text: txt(c.category) }),
      ' · ',
      el('span', { text: sponsorName(c.sponsor) }),
      c.sponsor?.isVerified ? el('span', { class: 'verified', title: 'verified', text: ' ✓' }) : null,
    ),
  );

  const skills = skillsOf(c);
  if (skills.length) {
    card.append(el('ul', { class: 'card-skills' }, skills.map((s) => el('li', { text: String(s) }))));
  }

  const fee = Number(c.entryFeeUsd);
  const feeText = !Number.isFinite(fee) || fee <= 0 ? 'gratis' : usd(fee);

  card.append(
    el(
      'dl',
      { class: 'card-stats' },
      el('dt', { text: 'pot' }), el('dd', { class: 'pot', text: usd(c.rewardAmount) }),
      el('dt', { text: 'entry' }), el('dd', { text: feeText }),
      el('dt', { text: 'sisa' }), el('dd', { text: timeLeft(c.deadline).text }),
      el('dt', { text: 'entri' }), el('dd', { text: compactNum(c.submissionCount) }),
    ),
  );

  card.append(
    el(
      'nav',
      { class: 'card-links' },
      el('a', { href: bountyLink(c.slug), text: 'detail' }),
      el('a', { href: hash(`/bounty/${encodeURIComponent(c.slug)}/leaderboard`), text: 'peringkat' }),
    ),
  );
  return card;
}

/* ---------- viewBounty ---------- */

export function viewBounty(c) {
  const d = c || {};
  const open = isStillOpen(d.deadline);
  const wrap = el('article', { class: 'bounty' });

  wrap.append(
    el('h1', { class: 'bounty-title', text: txt(d.title || d.slug) }),
    el(
      'p',
      { class: 'bounty-sub' },
      d.sponsor?.name || d.sponsor?.slug
        ? el('a', { href: hash(`/bounty/${encodeURIComponent(d.slug)}`), text: sponsorName(d.sponsor) })
        : el('span', { text: DASH }),
      d.sponsor?.isVerified ? el('span', { class: 'verified', text: ' ✓' }) : null,
      ' · ',
      el('span', { text: txt(d.category) }),
      ' · ',
      openBadge(d),
    ),
  );

  const skills = skillsOf(d);
  if (skills.length) wrap.append(el('ul', { class: 'card-skills' }, skills.map((s) => el('li', { text: String(s) }))));

  wrap.append(el('p', { class: 'bounty-desc', text: txt(d.description) }));

  const rows = rewardsRows(d.rewards);
  if (rows.length) {
    const table = el('table', { class: 'rewards' });
    table.append(
      el('thead', {}, el('tr', {}, el('th', { text: 'place' }), el('th', { text: 'hadiah' }))),
      el(
        'tbody',
        {},
        rows.map(([place, amount]) =>
          el('tr', {}, el('td', { text: `#${place}` }), el('td', { text: usd(amount) })),
        ),
      ),
    );
    wrap.append(el('h2', { text: 'Rewards' }), table);
  }

  const fee = Number(d.entryFeeUsd);
  wrap.append(
    el(
      'dl',
      { class: 'kv' },
      el('dt', { text: 'total pot' }), el('dd', { text: usd(d.rewardAmount) }),
      el('dt', { text: 'entry fee' }), el('dd', { text: !Number.isFinite(fee) || fee <= 0 ? 'gratis' : usd(fee) }),
      el('dt', { text: 'dibuka' }), el('dd', { text: localDate(d.publishedAt) }),
      el('dt', { text: 'tutup' }), el('dd', { text: localDate(d.deadline) }),
      el('dt', { text: 'sisa waktu' }), el('dd', { text: timeLeft(d.deadline).text }),
      el('dt', { text: 'status' }), el('dd', { text: open ? 'buka' : 'tutup' }),
      el('dt', { text: 'entri' }), el('dd', { text: compactNum(d.submissionCount) }),
    ),
  );

  wrap.append(
    el(
      'nav',
      { class: 'card-links' },
      el('a', { href: hash(`/bounty/${encodeURIComponent(d.slug)}/leaderboard`), text: 'lihat peringkat →' }),
      d.url ? el('a', { href: String(d.url), rel: 'noopener noreferrer', text: 'sumber' }) : null,
      el('a', { href: hash('/'), text: '← semua bounty' }),
    ),
  );
  return wrap;
}

/* ---------- viewLeaderboard ---------- */

export function viewLeaderboard(lb) {
  const L = lb || {};
  const entries = Array.isArray(L.entries) ? L.entries : [];
  const wrap = el('section', { class: 'leaderboard' });

  wrap.append(
    el('h1', { class: 'lb-title', text: txt(L.title || L.competition?.title || L.competition?.slug) }),
    el(
      'p',
      { class: 'lb-sub' },
      el('span', { text: `status: ${txt(L.competition?.status)}` }),
      L.phase?.title ? ` · fase: ${L.phase.title}` : '',
      L.rank_key ? ` · rank: ${L.rank_key}` : '',
      L.tie_break?.key ? ` · tie-break: ${L.tie_break.key} (${txt(L.tie_break.better)})` : '',
    ),
  );

  if (L.metrics_withheld) {
    wrap.append(el('p', { class: 'note withheld', text: 'Sebagian metrik belum dipublikasikan penyelenggara.' }));
  }
  if (!entries.length) {
    wrap.append(el('p', { class: 'empty', text: 'belum ada entri' }));
  } else {
    const table = el('table', { class: 'lb' });
    table.append(
      el(
        'thead',
        {},
        el('tr', {}, el('th', { text: '#' }), el('th', { text: 'handle' }), el('th', { text: 'judul' }),
          el('th', { text: 'metrik' }), el('th', { text: 'cost' })),
      ),
      el(
        'tbody',
        {},
        entries.map((e) => {
          const rank = e.prize_rank ?? e.rank;
          const handleCell = e.handle
            ? el('a', { href: hash(`/u/${encodeURIComponent(e.handle)}`), text: String(e.handle) })
            : el('span', { text: DASH });
          const titleCell = e.origin_url
            ? el('a', { href: String(e.origin_url), rel: 'noopener noreferrer', text: txt(e.title) })
            : el('span', { text: txt(e.title) });

          const metrics = e.values && typeof e.values === 'object'
            ? Object.entries(e.values).map(([k, v]) =>
                el('span', { class: 'metric', text: `${k}: ${typeof v === 'number' ? pct(v) : anyValue(v)}` }))
            : el('span', { text: anyValue(e.values) });

          return el(
            'tr',
            { class: e.compliant === false ? 'noncompliant' : '' },
            el('td', { class: 'rank', text: txt(rank) }),
            el('td', {}, handleCell),
            el('td', {}, titleCell, e.status ? el('span', { class: 'status', text: ` (${e.status})` }) : null),
            el('td', { class: 'metrics' }, metrics),
            el('td', { text: Number.isFinite(Number(e.cost)) ? usd(e.cost) : anyValue(e.cost) }),
          );
        }),
      ),
    );
    wrap.append(table);
  }

  wrap.append(el('a', { class: 'card-links', href: bountyLink(L.competition?.slug ?? ''), text: '← detail bounty' }));
  return wrap;
}

/* ---------- viewProfile ---------- */

export function viewProfile(p) {
  const u = p || {};
  const wrap = el('section', { class: 'profile' });

  const img = el('img', { class: 'avatar', alt: txt(u.handle || u.display_name), loading: 'lazy' });
  img.crossOrigin = 'anonymous';          // before src, per spec
  const src = u.avatar || u.image;
  if (src) img.src = String(src); else img.hidden = true;

  wrap.append(
    el('header', { class: 'profile-head' }, img,
      el('div', {},
        el('h1', { text: txt(u.display_name || u.handle) }),
        el('p', { class: 'handle' },
          u.profile_url ? el('a', { href: String(u.profile_url), rel: 'noopener noreferrer', text: `@${txt(u.handle)}` })
                        : el('span', { text: `@${txt(u.handle)}` })),
      ),
    ),
    el('p', { class: 'bio', text: txt(u.bio) }),
  );

  const links = el('nav', { class: 'card-links' });
  if (u.github_login) links.append(el('a', { href: `https://github.com/${encodeURIComponent(u.github_login)}`, rel: 'noopener noreferrer', text: `github: ${u.github_login}` }));
  if (u.x) links.append(el('span', { text: `x: ${u.x}` }));
  if (links.childNodes.length) wrap.append(links);

  wrap.append(
    el('dl', { class: 'kv' },
      el('dt', { text: 'bergabung' }), el('dd', { text: localDate(u.joined_at) }),
      el('dt', { text: 'handle' }), el('dd', { text: txt(u.handle) })),
  );

  for (const [label, key] of [['record', 'record'], ['solutions', 'solutions'], ['payouts', 'payouts']]) {
    const v = u[key];
    if (v === null || v === undefined) continue;
    wrap.append(el('h2', { text: label }), kvList(v));
  }
  return wrap;
}

/* ---------- shell helpers ---------- */

export function skeleton(lines = 4) {
  const wrap = el('div', { class: 'skeleton', 'aria-busy': 'true', role: 'status' });
  for (let i = 0; i < lines; i++) wrap.append(el('div', { class: 'sk-line' }));
  return wrap;
}

export function error(msg) {
  const wrap = el('div', { class: 'error', role: 'alert' });
  wrap.append(el('p', { class: 'error-title', text: 'gagal memuat' }));
  wrap.append(el('p', { class: 'error-msg', text: txt(msg) }));
  return wrap;
}

const views = { viewBoard, viewBounty, viewLeaderboard, viewProfile, skeleton, error };
export default views;
