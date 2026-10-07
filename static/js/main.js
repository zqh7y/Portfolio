import {
  splitText, initCursor, initMagnetic, initTilt, initScramble,
  initStickers, initClocks, initMarquees, initPile, toast,
} from './fx.js';
import { initTagSphere } from './tag-sphere.js';
import { initRepos } from './repos.js';

const { gsap, ScrollTrigger, Lenis } = window;
gsap.registerPlugin(ScrollTrigger);

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const GITHUB = $('.contact .btn--ink')?.href ?? 'https://github.com';

// ── smooth scroll ──────────────────────────────────────
let lenis = null;
let nativeVelocity = 0;
if (!reduce) {
  lenis = new Lenis({ lerp: 0.09, touchMultiplier: 1.3 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
} else {
  let lastY = scrollY;
  addEventListener('scroll', () => { nativeVelocity = scrollY - lastY; lastY = scrollY; }, { passive: true });
  gsap.ticker.add(() => { nativeVelocity *= 0.9; });
}
const getVelocity = () => (lenis ? lenis.velocity : nativeVelocity);

$$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
  const id = a.getAttribute('href');
  const el = id === '#top' ? 0 : $(id);
  if (el == null) return;
  e.preventDefault();
  if (lenis) lenis.scrollTo(el, { duration: 1.6 });
  else if (el === 0) scrollTo({ top: 0 });
  else el.scrollIntoView();
}));

// ── split text up front so the loader hides the swap ───
const splits = new Map();
$$('[data-split]').forEach((el) => splits.set(el, splitText(el, el.dataset.split)));

// ── hero name fills the full width ─────────────────────
function fitName() {
  const name = $('.hero__name');
  if (!name) return;
  name.style.fontSize = '';
  const box = name.parentElement.clientWidth;
  const size = parseFloat(getComputedStyle(name).fontSize);
  const text = name.firstElementChild.getBoundingClientRect().width;
  name.style.fontSize = `${Math.min((size * box) / text, innerHeight * 0.5)}px`;
}
fitName();
document.fonts?.ready.then(() => { fitName(); ScrollTrigger.refresh(); });
addEventListener('resize', fitName);

// ── small effects ──────────────────────────────────────
const setCursor = fine && !reduce ? initCursor(gsap) : () => {};
if (fine) { initMagnetic(gsap); initTilt(gsap); }
initScramble();
initStickers(gsap);
initPile(gsap);
initClocks();
initMarquees(gsap, getVelocity);

$$('[data-copy]').forEach((btn) => btn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(btn.dataset.copy);
    toast('copied to clipboard ✦');
  } catch {
    location.href = `mailto:${btn.dataset.copy}`;
  }
}));

// ── 3D hero (loaded while the loader runs) ─────────────
async function loadHero() {
  try {
    const { initHero } = await import('./hero-scene.js');
    return initHero($('#hero-canvas'), { gsap, ScrollTrigger, reduce, onHover: setCursor });
  } catch (err) {
    console.warn('hero 3D disabled:', err);
    document.documentElement.classList.add('no-webgl');
    return null;
  }
}

// ── loader → intro ─────────────────────────────────────
async function boot() {
  const loader = $('#loader');
  const count = $('#loader-count');
  const bar = $('#loader-bar');
  const s = { v: 0 };
  const counter = gsap.to(s, {
    v: 100,
    duration: reduce ? 0.3 : 1.7,
    ease: 'power2.inOut',
    onUpdate() {
      count.textContent = Math.round(s.v);
      bar.style.transform = `scaleX(${s.v / 100})`;
    },
  });
  const [hero] = await Promise.all([
    loadHero(),
    counter.then(),
    Promise.race([document.fonts?.ready ?? Promise.resolve(), wait(2500)]),
  ]);

  scrollAnimations();

  const tl = gsap.timeline({
    onComplete: () => { loader.remove(); lenis?.start(); ScrollTrigger.refresh(); },
  });
  tl.to(loader, { clipPath: 'inset(0 0 100% 0)', duration: reduce ? 0.3 : 1.1, ease: 'expo.inOut' });
  heroIntro(tl, reduce ? 0.1 : 0.5);
  tl.add(() => hero?.intro(), reduce ? 0 : 0.45);
}

function heroIntro(tl, at) {
  if (reduce) return;
  const chars = splits.get($('.hero__name [data-split]')) ?? [];
  tl.from(chars, { yPercent: 115, skewY: 10, duration: 1.3, stagger: 0.06, ease: 'expo.out' }, at)
    .from('.hero__top .label, .hero__tagline', { y: 30, opacity: 0, duration: 1, stagger: 0.1, ease: 'expo.out' }, at + 0.2)
    .from('.hero__aside > *', { y: 30, opacity: 0, duration: 1, stagger: 0.1, ease: 'expo.out' }, at + 0.35)
    .from('.nav > *', { y: -30, opacity: 0, duration: 1, stagger: 0.08, ease: 'expo.out' }, at + 0.3)
    .from('.sticker', { scale: 0, duration: 1, stagger: 0.09, ease: 'back.out(2.2)' }, at + 0.6)
    .from('.sticker-hint', { opacity: 0, duration: 0.8 }, at + 1.2);
}

// ── scroll-driven animation ────────────────────────────
// Entrances: big motion normally, a plain fade for reduced-motion users.
const enter = (targets, vars, scrollTrigger) => gsap.from(targets, reduce
  ? { opacity: 0, duration: 0.5, stagger: vars.stagger ? 0.03 : 0, scrollTrigger }
  : { ...vars, scrollTrigger });

function scrollAnimations() {
  const hero = '#hero';
  const heroScrub = { trigger: hero, start: 'top top', end: 'bottom top', scrub: true };

  // work: horizontal ride on desktop, stacked cards on phones.
  // Created first so every trigger below accounts for the pin spacing.
  const mm = gsap.matchMedia();
  mm.add('(min-width: 901px) and (prefers-reduced-motion: no-preference)', () => {
    const track = $('#work-track');
    const dist = () => Math.max(track.scrollWidth - innerWidth, 0);
    const ride = gsap.to(track, {
      x: () => -dist(), ease: 'none',
      scrollTrigger: {
        trigger: '.work__pin', start: 'top top', end: () => `+=${dist()}`,
        pin: true, scrub: 0.8, invalidateOnRefresh: true, anticipatePin: 1,
      },
    });
    $$('.project', track).forEach((p) => {
      gsap.fromTo(p, { rotationY: -14, scale: 0.92, transformPerspective: 1400 }, {
        rotationY: 0, scale: 1, ease: 'none',
        scrollTrigger: { trigger: p, containerAnimation: ride, start: 'left right', end: 'left 35%', scrub: true },
      });
      const img = $('.project__visual--cover img', p);
      if (img) {
        gsap.fromTo(img, { xPercent: -7 }, {
          xPercent: 7, ease: 'none',
          scrollTrigger: { trigger: p, containerAnimation: ride, start: 'left right', end: 'right left', scrub: true },
        });
      }
    });
  });
  mm.add('(max-width: 900px)', () => {
    $$('.project').forEach((p) => enter(p, { y: 80, opacity: 0, duration: 1.1, ease: 'expo.out' }, { trigger: p, start: 'top 88%' }));
  });

  gsap.to('#progress', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.3 } });

  const nav = $('#nav');
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: (self) => nav.classList.toggle('is-hidden', self.direction === 1 && self.scroll() > innerHeight * 0.9),
  });
  $$('.nav__links a').forEach((link) => {
    const section = $(link.getAttribute('href'));
    if (!section) return;
    ScrollTrigger.create({
      trigger: section, start: 'top center', end: 'bottom center',
      onToggle: (self) => link.classList.toggle('is-active', self.isActive),
    });
  });

  // hero melts away while scrolling
  if (!reduce) {
    const chars = splits.get($('.hero__name [data-split]')) ?? [];
    gsap.to(chars, { y: (i) => -(40 + (i % 3) * 55), rotation: (i) => (i % 2 ? 7 : -7), ease: 'none', scrollTrigger: heroScrub });
    gsap.to('.stickers', { yPercent: -35, ease: 'none', scrollTrigger: heroScrub });
    gsap.to('.hero__top', { y: -120, opacity: 0, ease: 'none', scrollTrigger: heroScrub });
  }

  // headings: words rise out of masks
  $$('.h2, .contact__title').forEach((head) => {
    enter($$('.split-unit', head), {
      yPercent: 120, skewY: 8, duration: 1.2, stagger: head.classList.contains('h2') ? 0.08 : 0.025, ease: 'expo.out',
    }, { trigger: head, start: 'top 85%' });
  });

  // about: words light up as you read
  const about = $('[data-reveal="scrub-words"]');
  if (about) {
    const words = splitText(about, 'words');
    const loud = /^(android|roblox|python|2022|google|play|10k|964,817,253)/i;
    words.forEach((w) => { if (loud.test(w.textContent)) w.classList.add('hl'); });
    gsap.fromTo(words, { opacity: 0.12 }, {
      opacity: 1, stagger: 0.1, ease: 'none',
      scrollTrigger: { trigger: about, start: 'top 82%', end: 'bottom 50%', scrub: true },
    });
    $$('.hl', about).forEach((w) => ScrollTrigger.create({
      trigger: w, start: 'top 62%', onEnter: () => w.classList.add('is-lit'), onLeaveBack: () => w.classList.remove('is-lit'),
    }));
  }

  enter('.bento__card', {
    y: 90, opacity: 0, rotationX: -30, transformOrigin: '50% 100%', duration: 1.2, stagger: 0.08, ease: 'expo.out',
  }, { trigger: '.bento', start: 'top 82%' });
  $$('[data-count]').forEach((el) => {
    const o = { v: 0 };
    gsap.to(o, {
      v: Number(el.dataset.count), duration: 1.8, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 92%' },
      onUpdate: () => { el.textContent = Math.round(o.v); },
    });
  });

  // lore timeline
  gsap.to('#timeline-fill', {
    scaleY: 1, ease: 'none',
    scrollTrigger: { trigger: '.timeline', start: 'top 60%', end: 'bottom 60%', scrub: true },
  });
  $$('.timeline__item').forEach((item, i) => {
    ScrollTrigger.create({
      trigger: item, start: 'top 60%',
      onEnter: () => item.classList.add('is-on'), onLeaveBack: () => item.classList.remove('is-on'),
    });
    const fromSide = innerWidth > 900 ? (i % 2 ? 70 : -70) : 40;
    enter($('.timeline__card', item), { x: fromSide, opacity: 0, duration: 1.1, ease: 'expo.out' }, { trigger: item, start: 'top 85%' });
  });

  // q&a flip cards
  const cards = $$('.qa-card');
  cards.forEach((card) => card.addEventListener('click', () => {
    const on = card.classList.toggle('is-flipped');
    card.setAttribute('aria-pressed', String(on));
  }));
  if (cards.length) {
    enter(cards, {
      y: 70, rotationX: -60, opacity: 0, transformPerspective: 1000, transformOrigin: '50% 0%',
      duration: 1.2, stagger: 0.08, ease: 'expo.out',
    }, { trigger: '.qa__grid', start: 'top 82%' });
  }

  // irl photo pile drops in
  enter('.polaroid', {
    y: -260, opacity: 0, rotation: (i) => (i % 2 ? 25 : -25), duration: 1.2, stagger: 0.12, ease: 'back.out(1.3)',
  }, { trigger: '.pile', start: 'top 80%' });

  // stack
  $$('.stack__group').forEach((group) => enter($$('li', group), {
    scale: 0.6, opacity: 0, duration: 0.8, stagger: 0.04, ease: 'back.out(2)',
  }, { trigger: group, start: 'top 88%' }));
  enter('.stack__sphere', { scale: 0.6, opacity: 0, rotation: -20, duration: 1.6, ease: 'expo.out' }, { trigger: '.stack__sphere', start: 'top 85%' });

  // lab
  enter('.lab__stage, .lab__panel > *', { y: 60, opacity: 0, duration: 1.1, stagger: 0.08, ease: 'expo.out' }, { trigger: '.lab__grid', start: 'top 82%' });

  // footer letters
  enter('.footer__big span', {
    yPercent: 100, rotation: (i) => (i % 2 ? 10 : -10), duration: 1.4, stagger: 0.06, ease: 'expo.out',
  }, { trigger: '.footer', start: 'top 92%' });

  ScrollTrigger.sort();
}

// ── tag sphere ─────────────────────────────────────────
const sphere = $('#tag-sphere');
if (sphere) initTagSphere(sphere, { reduce });

// ── egg lab (lazy) ─────────────────────────────────────
function initLab() {
  const canvas = $('#egg-canvas');
  const btn = $('#hatch-btn');
  if (!canvas || !btn) return;
  const ui = {
    rarity: $('#hatch-rarity'), name: $('#hatch-name'), chance: $('#hatch-chance'), tags: $('#hatch-tags'),
    count: $('#hatch-count'), best: $('#hatch-best'), card: $('#hatch-result'),
  };
  const store = {
    get(key, fallback) { try { return JSON.parse(localStorage.getItem(`zzqxck:${key}`)) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(`zzqxck:${key}`, JSON.stringify(value)); } catch { /* private mode */ } },
  };
  let hatched = store.get('hatched', 0);
  let best = store.get('best', null);
  const paintStats = () => {
    ui.count.textContent = hatched.toLocaleString();
    ui.best.textContent = best ? best.label : '—';
  };
  paintStats();

  let lab = null;
  let colors = {};

  const onResult = ({ phase, result }) => {
    if (phase === 'rolling') {
      btn.disabled = true;
      ui.rarity.textContent = 'rolling';
      ui.rarity.dataset.r = '';
      ui.name.textContent = 'hatching…';
      ui.chance.textContent = 'the server is rolling';
      ui.tags.textContent = '';
      return;
    }
    btn.disabled = false;
    const { pet, size, shiny, chance_label: label, chance } = result;
    const prefix = [shiny && 'Shiny', size !== 'normal' && size[0].toUpperCase() + size.slice(1)].filter(Boolean).join(' ');
    ui.rarity.textContent = pet.rarity;
    ui.rarity.dataset.r = pet.rarity;
    ui.name.textContent = prefix ? `${prefix} ${pet.name}` : pet.name;
    ui.chance.textContent = label;
    ui.tags.textContent = '';
    if (size !== 'normal') ui.tags.append(Object.assign(document.createElement('span'), { textContent: size }));
    if (shiny) ui.tags.append(Object.assign(document.createElement('span'), { textContent: 'shiny', className: 'shiny' }));
    gsap.fromTo(ui.card, { scale: 0.85, rotation: -4 }, { scale: 1, rotation: 0, duration: 0.9, ease: 'elastic.out(1, 0.4)' });

    hatched += 1;
    if (!best || chance > best.chance) {
      best = { chance, label: `${ui.name.textContent} · ${label}` };
      if (hatched > 1) toast(`new best pull ✦ ${label}`);
    }
    store.set('hatched', hatched);
    store.set('best', best);
    paintStats();
    if (chance >= 1000) toast(`insane pull!! ${label}`);
  };

  const hatch = () => lab?.hatch();
  btn.addEventListener('click', hatch);
  addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'e' || e.repeat || e.metaKey || e.ctrlKey) return;
    if (lab?.isVisible()) hatch();
  });

  new IntersectionObserver(async ([entry], obs) => {
    if (!entry.isIntersecting) return;
    obs.disconnect();
    try {
      const mod = await import('./egg-lab.js');
      colors = mod.RARITY_COLORS;
      lab = mod.initEggLab(canvas, { gsap, reduce, onResult });
      renderOdds(colors, mod.formatOdds);
    } catch (err) {
      console.warn('egg lab disabled:', err);
      ui.name.textContent = '3D not supported here';
      btn.disabled = true;
    }
  }, { rootMargin: '600px' }).observe(canvas);
}

async function renderOdds(colors, formatOdds) {
  const list = $('#odds-list');
  let rows;
  try {
    const res = await fetch('/api/hatch/odds');
    if (!res.ok) throw new Error(res.status);
    rows = await res.json();
  } catch {
    rows = [
      ['zzqxck', 'secret', 1e6], ['Dragon', 'mythical', 1000], ['Axolotl', 'legendary', 250], ['Penguin', 'epic', 60],
      ['Fox', 'rare', 15], ['Bunny', 'uncommon', 5], ['Doggy', 'common', 2.81], ['Kitty', 'common', 2.81],
    ].map(([name, rarity, odds]) => ({ name, rarity, chance_label: formatOdds(odds) }));
  }
  list.textContent = '';
  rows.reverse().forEach((r) => {
    const li = document.createElement('li');
    const left = document.createElement('span');
    const dot = document.createElement('i');
    dot.style.background = colors[r.rarity] ?? '#ccc';
    const b = document.createElement('b');
    b.textContent = r.rarity === 'secret' ? '??? (secret)' : r.name;
    left.append(dot, b);
    const right = document.createElement('span');
    right.className = 'mono';
    right.textContent = r.chance_label;
    li.append(left, right);
    list.append(li);
  });
}

initLab();
initRepos({ gsap, ScrollTrigger, github: GITHUB });
addEventListener('load', () => ScrollTrigger.refresh());
boot();
