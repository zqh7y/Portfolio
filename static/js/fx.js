// Small interaction effects: split text, cursor, magnetic, tilt, scramble,
// draggable stickers, clocks, marquees, toast.

export function splitText(el, mode = 'words') {
  const text = el.textContent.trim().replace(/\s+/g, ' ');
  if (!el.closest('[aria-label]')) el.setAttribute('aria-label', text);
  el.textContent = '';
  const units = [];
  text.split(' ').forEach((word, wi, words) => {
    const line = document.createElement('span');
    line.className = 'split-line';
    line.setAttribute('aria-hidden', 'true');
    if (mode === 'chars') {
      for (const ch of word) {
        const u = document.createElement('span');
        u.className = 'split-unit';
        u.textContent = ch;
        line.append(u);
        units.push(u);
      }
    } else {
      const u = document.createElement('span');
      u.className = 'split-unit';
      u.textContent = word;
      line.append(u);
      units.push(u);
    }
    el.append(line);
    if (wi < words.length - 1) el.append(' ');
  });
  return units;
}

export function initCursor(gsap) {
  const root = document.querySelector('.cursor');
  const dot = root.querySelector('.cursor__dot');
  const ring = root.querySelector('.cursor__ring');
  const label = root.querySelector('.cursor__label');
  document.documentElement.classList.add('has-cursor');

  const dx = gsap.quickTo(dot, 'x', { duration: 0.08 });
  const dy = gsap.quickTo(dot, 'y', { duration: 0.08 });
  const rx = gsap.quickTo(ring, 'x', { duration: 0.5, ease: 'power3' });
  const ry = gsap.quickTo(ring, 'y', { duration: 0.5, ease: 'power3' });
  gsap.set([dot, ring], { x: innerWidth / 2, y: innerHeight / 2 });

  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY);
    root.style.opacity = '1';
  }, { passive: true });
  document.addEventListener('pointerleave', () => { root.style.opacity = '0'; });
  addEventListener('pointerdown', () => root.classList.add('is-down'));
  addEventListener('pointerup', () => root.classList.remove('is-down'));

  let forced = null;
  const apply = (target) => {
    const tagged = forced ?? target?.closest?.('[data-cursor]')?.dataset.cursor;
    root.classList.toggle('is-hover', Boolean(tagged));
    root.classList.toggle('is-link', !tagged && Boolean(target?.closest?.('a, button, .sticker')));
    if (tagged) label.textContent = tagged;
  };
  let lastTarget = null;
  document.addEventListener('pointerover', (e) => { lastTarget = e.target; apply(e.target); });
  // scenes can force a label (e.g. hovering the blob)
  return (text) => { forced = text; apply(lastTarget); };
}

export function initMagnetic(gsap) {
  document.querySelectorAll('[data-magnetic]').forEach((el) => {
    const xTo = gsap.quickTo(el, 'x', { duration: 0.8, ease: 'elastic.out(1, 0.4)' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.8, ease: 'elastic.out(1, 0.4)' });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = el.getBoundingClientRect();
      xTo((e.clientX - (r.left + r.width / 2)) * 0.3);
      yTo((e.clientY - (r.top + r.height / 2)) * 0.4);
    });
    el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
  });
}

export function initTilt(gsap) {
  document.querySelectorAll('[data-tilt]').forEach((el) => {
    gsap.set(el, { transformPerspective: 1000 });
    const rx = gsap.quickTo(el, 'rotationX', { duration: 0.7, ease: 'power3' });
    const ry = gsap.quickTo(el, 'rotationY', { duration: 0.7, ease: 'power3' });
    const max = el.classList.contains('project__card') ? 6 : 12;
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      ry((px - 0.5) * max);
      rx((0.5 - py) * max);
      el.style.setProperty('--gx', `${px * 100}%`);
      el.style.setProperty('--gy', `${py * 100}%`);
    });
    el.addEventListener('pointerleave', () => { rx(0); ry(0); });
  });
}

const GLYPHS = '!<>-_\\/[]{}=+*^?#01zzqxck✦';
export function initScramble() {
  document.querySelectorAll('[data-scramble]').forEach((el) => {
    const text = el.textContent;
    let raf = 0;
    el.addEventListener('pointerenter', () => {
      let frame = 0;
      cancelAnimationFrame(raf);
      const tick = () => {
        el.textContent = [...text].map((c, i) => (i < frame / 2.5 ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join('');
        if (frame++ < text.length * 2.5) raf = requestAnimationFrame(tick);
        else el.textContent = text;
      };
      tick();
    });
  });
}

export function initStickers(gsap) {
  document.querySelectorAll('.sticker').forEach((el) => {
    const base = parseFloat(getComputedStyle(el).getPropertyValue('--r')) || 0;
    gsap.set(el, { rotation: base });
    let start = null;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      start = { x: e.clientX, y: e.clientY, ox: gsap.getProperty(el, 'x'), oy: gsap.getProperty(el, 'y'), lx: e.clientX };
      el.classList.add('is-drag');
      gsap.to(el, { scale: 1.12, duration: 0.3, ease: 'back.out(3)' });
    });
    el.addEventListener('pointermove', (e) => {
      if (!start) return;
      const vx = e.clientX - start.lx;
      start.lx = e.clientX;
      gsap.set(el, { x: start.ox + e.clientX - start.x, y: start.oy + e.clientY - start.y });
      gsap.to(el, { rotation: base + Math.max(-25, Math.min(25, vx * 1.5)), duration: 0.4, ease: 'power2.out' });
    });
    const end = () => {
      if (!start) return;
      start = null;
      el.classList.remove('is-drag');
      gsap.to(el, { scale: 1, rotation: base, duration: 0.9, ease: 'elastic.out(1, 0.35)' });
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  });
}

export function initClocks() {
  const nodes = [...document.querySelectorAll('[data-clock]')];
  if (!nodes.length) return;
  const fmt = (tz, secs) => {
    try {
      return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: secs ? '2-digit' : undefined }).format(new Date());
    } catch {
      return new Date().toLocaleTimeString();
    }
  };
  const tick = () => nodes.forEach((n) => { n.textContent = fmt(n.dataset.clock, n.hasAttribute('data-seconds')); });
  tick();
  setInterval(tick, 1000);
}

export function initMarquees(gsap, getVelocity) {
  const rows = [...document.querySelectorAll('[data-marquee]')].map((el) => ({
    el, track: el.querySelector('.marquee__track'), dir: Number(el.dataset.marquee) || 1, x: 0, w: 0,
  }));
  if (!rows.length) return;
  const measure = () => rows.forEach((r) => { r.w = r.track.firstElementChild.getBoundingClientRect().width; });
  measure();
  addEventListener('resize', measure);
  document.fonts?.ready.then(measure);

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(rows[0].el.parentElement);
  let heading = 1;
  gsap.ticker.add((_, dt) => {
    if (!visible) return;
    const v = getVelocity();
    if (Math.abs(v) > 0.5) heading = Math.sign(v);
    const speed = (1.1 + Math.min(Math.abs(v) * 0.35, 14)) * (dt / 16.67);
    rows.forEach((r) => {
      if (!r.w) return;
      r.x -= r.dir * heading * speed;
      r.x = ((r.x % r.w) - r.w) % r.w;
      r.track.style.transform = `translate3d(${r.x.toFixed(2)}px, 0, 0)`;
    });
  });
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 2200);
}

// Photo pile: drag a polaroid anywhere, tap (or Enter) to send it to the back.
export function initPile(gsap, reduce = false) {
  const pile = document.getElementById('pile');
  if (!pile) return;
  const cards = [...pile.querySelectorAll('.polaroid')];
  const restack = (front) => {
    // keep z-indexes small: everything else keeps its order, `front` goes on top (or bottom)
    const order = cards
      .filter((c) => c !== front.card)
      .sort((a, b) => Number(a.style.zIndex) - Number(b.style.zIndex));
    if (front.where === 'top') order.push(front.card); else order.unshift(front.card);
    order.forEach((c, i) => { c.style.zIndex = String(i + 1); });
  };
  cards.forEach((card, i) => { card.style.zIndex = String(i + 1); });

  cards.forEach((card) => {
    const base = parseFloat(card.style.getPropertyValue('--r')) || 0;
    let start = null;
    let busy = null;

    const shuffle = () => {
      if (cards.length < 2) return;
      busy?.progress(1).kill(); // settle any running shuffle first, so its lifted y is never taken as home
      const y0 = gsap.getProperty(card, 'y');
      if (reduce) { restack({ card, where: 'bottom' }); return; }
      busy = gsap.timeline({ onComplete: () => { busy = null; } })
        .to(card, { y: y0 - 90, rotation: base + 12, duration: 0.25, ease: 'power2.out' })
        .add(() => restack({ card, where: 'bottom' }))
        .to(card, { y: y0, rotation: base, duration: 0.6, ease: 'back.out(1.6)' });
    };

    card.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      busy?.progress(1).kill();
      busy = null;
      gsap.killTweensOf(card, 'x,y,rotation,scale');
      card.setPointerCapture(e.pointerId);
      restack({ card, where: 'top' });
      start = { x: e.clientX, y: e.clientY, ox: gsap.getProperty(card, 'x'), oy: gsap.getProperty(card, 'y'), lx: e.clientX, moved: 0 };
      card.classList.add('is-drag');
      gsap.to(card, { scale: 1.05, duration: 0.3, ease: 'back.out(3)' });
    });
    card.addEventListener('pointermove', (e) => {
      if (!start) return;
      const vx = e.clientX - start.lx;
      start.lx = e.clientX;
      start.moved = Math.max(start.moved, Math.hypot(e.clientX - start.x, e.clientY - start.y));
      gsap.set(card, { x: start.ox + e.clientX - start.x, y: start.oy + e.clientY - start.y });
      gsap.to(card, { rotation: base + Math.max(-20, Math.min(20, vx * 1.2)), duration: 0.4, ease: 'power2.out' });
    });
    const end = () => {
      if (!start) return;
      const tapped = start.moved < 6;
      start = null;
      card.classList.remove('is-drag');
      gsap.to(card, { scale: 1, rotation: base, duration: 0.9, ease: 'elastic.out(1, 0.4)' });
      if (tapped) shuffle();
    };
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
    card.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      shuffle();
    });
  });
}
