// A draggable, auto-spinning sphere of tech tags (pure DOM, projected by hand).
export function initTagSphere(el, { reduce }) {
  const seen = new Set();
  const items = [...el.querySelectorAll('.tag-sphere__item')].filter((node) => {
    const key = node.textContent.trim().toLowerCase();
    if (seen.has(key)) { node.remove(); return false; }
    seen.add(key);
    return true;
  });
  const n = items.length;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const pts = items.map((_, i) => {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    return [Math.cos(golden * i) * r, y, Math.sin(golden * i) * r];
  });

  let radius = 200;
  const measure = () => { radius = el.clientWidth * 0.41; };
  new ResizeObserver(measure).observe(el);
  measure();

  let rx = 0.3, ry = 0;
  let vx = 0.0012, vy = reduce ? 0.0008 : 0.0032;
  const base = { x: vx, y: vy };
  let drag = null;

  el.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY };
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    vy = (e.clientX - drag.x) * 0.0016;
    vx = -(e.clientY - drag.y) * 0.0016;
    drag = { x: e.clientX, y: e.clientY };
  });
  const end = () => { drag = null; };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  let running = false;
  const frame = () => {
    if (!running) return;
    if (!drag) {
      vx += (base.x - vx) * 0.02;
      vy += (base.y - vy) * 0.02;
    }
    rx += vx;
    ry += vy;
    const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
    for (let i = 0; i < n; i++) {
      const [x, y, z] = pts[i];
      const x1 = x * cy + z * sy;
      const z1 = -x * sy + z * cy;
      const y2 = y * cx - z1 * sx;
      const z2 = y * sx + z1 * cx;
      const depth = (z2 + 1) / 2; // 0 back … 1 front
      const s = 0.5 + depth * 0.6;
      const node = items[i];
      node.style.transform = `translate(-50%, -50%) translate3d(${(x1 * radius).toFixed(1)}px, ${(y2 * radius).toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
      node.style.opacity = (0.18 + depth * 0.82).toFixed(3);
      node.style.zIndex = String(Math.round(depth * 100));
    }
    requestAnimationFrame(frame);
  };

  new IntersectionObserver(([entry]) => {
    const was = running;
    running = entry.isIntersecting;
    if (running && !was) requestAnimationFrame(frame);
  }).observe(el);
}
