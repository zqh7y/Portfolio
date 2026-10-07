// "The archive": every public repo, served by the Python API (live GitHub or snapshot).
const LANG_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572a5', Luau: '#00a2ff',
  HTML: '#e34c26', CSS: '#663399', SCSS: '#c6538c', Kotlin: '#a97bff', Java: '#b07219',
};
const color = (lang) => LANG_COLORS[lang] ?? '#b5b5b5';

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k === 'style') Object.assign(el.style, v);
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
function ago(iso) {
  if (!iso) return '';
  const secs = (new Date(iso) - Date.now()) / 1000;
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, size] of units) {
    if (Math.abs(secs) >= size) return rtf.format(Math.round(secs / size), unit);
  }
  return 'just now';
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

export async function initRepos({ gsap, ScrollTrigger, github }) {
  const grid = document.getElementById('repo-grid');
  const source = document.getElementById('repos-source');
  const bar = document.getElementById('langbar');
  const filters = document.getElementById('repo-filters');
  if (!grid) return;

  let feed, stats;
  try {
    [feed, stats] = await Promise.all([getJSON('api/repos.json'), getJSON('api/stats.json')]);
  } catch {
    source.textContent = 'offline · ';
    source.append(h('a', { href: github, target: '_blank', rel: 'noopener' }, 'open github ↗'));
    return;
  }

  const at = new Date(feed.fetched_at);
  source.textContent = feed.source === 'live'
    ? `● live from github · ${feed.repos.length} repos · ${at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : `○ ${feed.source === 'static' ? 'synced' : 'snapshot'} ${at.toLocaleDateString([], { day: 'numeric', month: 'short' })} · ${feed.repos.length} repos`;

  // language bar
  stats.languages.forEach((l) => {
    const seg = h('span', { title: `${l.name} · ${Math.round(l.share * 100)}%`, style: { background: color(l.name) } });
    bar.append(seg);
    requestAnimationFrame(() => requestAnimationFrame(() => { seg.style.flexBasis = `${l.share * 100}%`; }));
  });

  // cards
  const cards = feed.repos.map((r) => {
    const meta = h('div', { class: 'repo__meta mono' },
      r.language && h('span', {}, h('i', { style: { background: color(r.language) } }), r.language),
      r.play_store != null && h('span', { class: 'repo__play' }, `▶ google play${r.play_store ? ` · ${r.play_store}` : ''}`),
      r.stargazers_count > 0 && h('span', {}, `★ ${r.stargazers_count}`),
      h('span', {}, ago(r.pushed_at)),
    );
    const card = h('a', { class: 'repo', href: r.html_url, target: '_blank', rel: 'noopener', 'data-lang': r.language || 'other', 'data-play': r.play_store != null ? '1' : '', 'data-cursor': 'open ↗' },
      h('div', { class: 'repo__top' },
        h('span', { class: 'repo__name' }, r.name),
        h('span', { class: 'repo__arrow', 'aria-hidden': 'true' }, '↗'),
      ),
      h('p', { class: 'repo__desc' }, r.description || 'no description, just vibes.'),
      r.topics.length > 0 && h('ul', { class: 'chips' }, r.topics.slice(0, 3).map((t) => h('li', {}, t))),
      meta,
    );
    grid.append(card);
    return card;
  });

  // filters
  const PLAY = 'google play';
  const onPlay = cards.filter((c) => c.dataset.play).length;
  const langs = ['all', ...(onPlay ? [PLAY] : []), ...stats.languages.map((l) => l.name)];
  const counts = { [PLAY]: onPlay, ...Object.fromEntries(stats.languages.map((l) => [l.name, l.count])) };
  const buttons = langs.map((lang) => {
    const btn = h('button', { type: 'button', role: 'tab', class: lang === 'all' ? 'is-on' : '' },
      lang !== 'all' && h('i', { style: { background: lang === PLAY ? 'var(--accent)' : color(lang) } }),
      lang, h('sup', {}, String(lang === 'all' ? feed.repos.length : counts[lang])),
    );
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.toggle('is-on', b === btn));
      const shown = cards.filter((c) => {
        const on = lang === 'all' || (lang === PLAY ? Boolean(c.dataset.play) : c.dataset.lang === lang);
        c.classList.toggle('is-hidden', !on);
        return on;
      });
      gsap.fromTo(shown, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.03, ease: 'expo.out', clearProps: 'transform' });
      ScrollTrigger.refresh();
    });
    filters.append(btn);
    return btn;
  });

  gsap.set(cards, { opacity: 0, y: 50 });
  ScrollTrigger.batch(cards, {
    start: 'top 92%',
    once: true,
    onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.9, stagger: 0.06, ease: 'expo.out', clearProps: 'transform' }),
  });
  ScrollTrigger.refresh();
}
