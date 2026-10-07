// Hero: an iridescent chrome blob that wobbles, follows the pointer and
// reacts to clicks, with a few glossy shapes orbiting around it.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SIMPLEX_3D } from './noise.js';

// A soft white "studio" with pastel light panels: the chrome blob reflects
// these, which is what gives it the holographic sheen.
function holoStudio() {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(
    new THREE.SphereGeometry(12, 32, 16),
    new THREE.MeshBasicMaterial({ color: '#a9a9b3', side: THREE.BackSide }),
  ));
  const box = new THREE.BoxGeometry(1, 1, 1);
  const panels = [
    ['#ffffff', 6, [0, 7, 2], [7, 0.2, 5]],
    ['#ffffff', 3, [3, 2, 8], [4, 4, 0.2]],
    ['#0b0b0c', 1, [0, -2.5, -8], [14, 2.5, 0.2]],
    ['#0b0b0c', 1, [-8, -1.5, -3], [0.2, 2, 8]],
    ['#0b0b0c', 1, [5, 3, 7], [2, 6, 0.2]],
    ['#ff8fd0', 4, [-7, 1, 2], [0.2, 6, 4]],
    ['#7fdcff', 4, [7, -1, 1], [0.2, 6, 4]],
    ['#d4ff3a', 3, [0, -7, 3], [6, 0.2, 4]],
    ['#b49cff', 3, [-3, -2, -7], [5, 4, 0.2]],
  ];
  for (const [color, power, pos, scale] of panels) {
    const m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power) }));
    m.position.set(...pos);
    m.scale.set(...scale);
    env.add(m);
  }
  return env;
}

export function initHero(canvas, { gsap, ScrollTrigger, reduce, onHover }) {
  const small = matchMedia('(max-width: 700px)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(holoStudio(), 0.04).texture;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  const key = new THREE.DirectionalLight('#ffffff', 1.4);
  key.position.set(-3, 4, 5);
  scene.add(key);

  const world = new THREE.Group();
  scene.add(world);

  // ── the blob ──────────────────────────────────────────
  const uniforms = {
    uTime: { value: 0 },
    uAmp: { value: 0.2 },
    uFreq: { value: 0.8 },
    uPoke: { value: 0 },
  };
  const blobMat = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    metalness: 1,
    roughness: 0.1,
    iridescence: 1,
    iridescenceIOR: 1.55,
    iridescenceThicknessRange: [160, 820],
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.15,
  });
  blobMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', /* glsl */ `#include <common>
        uniform float uTime;
        uniform float uAmp;
        uniform float uFreq;
        uniform float uPoke;
        ${SIMPLEX_3D}
        float displace(vec3 p) {
          float t = uTime;
          float n = snoise(p * uFreq + vec3(t * .22, t * .17, t * .13));
          n += snoise(p * uFreq * 2.1 - vec3(t * .15)) * .16;
          n += snoise(p * 3.2 + vec3(t * 1.3)) * .25 * uPoke;
          return n * (uAmp + uPoke * .3);
        }
        vec3 orthogonal(vec3 v) {
          return normalize(abs(v.x) > abs(v.z) ? vec3(-v.y, v.x, 0.0) : vec3(0.0, -v.z, v.y));
        }`)
      .replace('#include <beginnormal_vertex>', /* glsl */ `
        vec3 dispPos = position + normal * displace(position);
        vec3 tA = orthogonal(normal);
        vec3 tB = normalize(cross(normal, tA));
        vec3 pA = position + tA * 0.012;
        vec3 pB = position + tB * 0.012;
        pA += normalize(pA) * displace(pA);
        pB += normalize(pB) * displace(pB);
        vec3 objectNormal = normalize(cross(pA - dispPos, pB - dispPos));
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`)
      .replace('#include <begin_vertex>', 'vec3 transformed = dispPos;');
  };
  const seg = small ? 128 : 192;
  const blob = new THREE.Mesh(new THREE.SphereGeometry(1.3, seg, seg), blobMat);
  world.add(blob);

  // ── orbiting shapes ───────────────────────────────────
  const gloss = (color, extra = {}) => new THREE.MeshPhysicalMaterial({
    color, roughness: 0.25, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1, ...extra,
  });
  const satDefs = [
    { geo: new THREE.TorusGeometry(0.26, 0.1, 32, 96), mat: gloss('#0b0b0c'), r: 2.25, speed: 0.32, phase: 0.2, tilt: 0.35, y: 0.5 },
    { geo: new RoundedBoxGeometry(0.42, 0.42, 0.42, 4, 0.1), mat: gloss('#d4ff3a', { roughness: 0.35 }), r: 2.45, speed: -0.24, phase: 2.2, tilt: -0.3, y: -0.4 },
    { geo: new THREE.SphereGeometry(0.2, 48, 48), mat: gloss('#ffffff', { metalness: 1, roughness: 0.05, iridescence: 1 }), r: 1.95, speed: 0.45, phase: 4.1, tilt: 0.6, y: 0.1 },
    { geo: new THREE.CapsuleGeometry(0.11, 0.38, 8, 24), mat: gloss('#f4f4f1'), r: 2.7, speed: 0.2, phase: 5.2, tilt: -0.15, y: 0.9 },
    { geo: new THREE.SphereGeometry(0.11, 32, 32), mat: gloss('#0b0b0c'), r: 2.1, speed: -0.38, phase: 1.1, tilt: 0.1, y: -0.95 },
    { geo: new THREE.IcosahedronGeometry(0.16, 0), mat: gloss('#ffffff', { metalness: 1, roughness: 0.18 }), r: 2.85, speed: 0.28, phase: 3.3, tilt: 0.45, y: -0.15 },
  ];
  const sats = satDefs.map((d) => {
    const mesh = new THREE.Mesh(d.geo, d.mat);
    mesh.userData = { ...d, spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(1.2) };
    world.add(mesh);
    return mesh;
  });

  // ── sizing ────────────────────────────────────────────
  let width = 1, height = 1;
  const resize = () => {
    width = canvas.clientWidth || 1;
    height = canvas.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // keep the blob comfortably inside portrait screens
    camera.position.z = camera.aspect < 1 ? 9 / Math.max(camera.aspect, 0.5) ** 0.75 : 9;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  // ── input ─────────────────────────────────────────────
  const pointer = new THREE.Vector2();
  const target = new THREE.Vector2();
  let speed = 0;
  let last = { x: 0, y: 0 };
  addEventListener('pointermove', (e) => {
    const nx = (e.clientX / innerWidth) * 2 - 1;
    const ny = (e.clientY / innerHeight) * 2 - 1;
    speed = Math.min(speed + Math.hypot(nx - last.x, ny - last.y) * 2, 1);
    last = { x: nx, y: ny };
    target.set(nx, ny);
  }, { passive: true });

  const raycaster = new THREE.Raycaster();
  const hitSphere = new THREE.Sphere();
  const ndc = new THREE.Vector2();
  const overBlob = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    blob.getWorldPosition(hitSphere.center);
    hitSphere.radius = 1.35 * blob.getWorldScale(new THREE.Vector3()).x;
    return raycaster.ray.intersectsSphere(hitSphere);
  };
  let hovering = false;
  canvas.addEventListener('pointermove', (e) => {
    const hit = overBlob(e);
    if (hit !== hovering) { hovering = hit; onHover?.(hit ? 'poke' : null); }
  });
  canvas.addEventListener('pointerleave', () => { if (hovering) { hovering = false; onHover?.(null); } });
  canvas.addEventListener('pointerdown', (e) => {
    if (!overBlob(e)) return;
    gsap.timeline()
      .to(uniforms.uPoke, { value: 1, duration: 0.18, ease: 'power2.out' })
      .to(uniforms.uPoke, { value: 0, duration: 1.8, ease: 'elastic.out(1, 0.3)' });
    gsap.to(blob.rotation, { y: `+=${Math.PI * 0.75}`, x: `+=${(Math.random() - 0.5) * 1.2}`, duration: 1.8, ease: 'expo.out' });
    gsap.fromTo(blob.scale, { x: 0.9, y: 1.12, z: 0.9 }, { x: 1, y: 1, z: 1, duration: 1.4, ease: 'elastic.out(1, 0.3)' });
    sats.forEach((s) => gsap.to(s.userData, { r: s.userData.r + 0.6, duration: 0.3, yoyo: true, repeat: 1, ease: 'power2.out' }));
  });

  // ── scroll ────────────────────────────────────────────
  let scrollP = 0;
  ScrollTrigger.create({
    trigger: canvas.parentElement,
    start: 'top top',
    end: 'bottom top',
    scrub: true,
    onUpdate: (self) => { scrollP = self.progress; },
  });

  // ── loop ──────────────────────────────────────────────
  const clock = new THREE.Clock();
  const intro = { s: reduce ? 1 : 0 };
  let t = 0;
  const tick = () => {
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt * (reduce ? 0.25 : 1);
    speed *= 0.94;

    pointer.lerp(target, 0.06);
    uniforms.uTime.value = t;
    uniforms.uAmp.value = 0.2 + speed * 0.16 + scrollP * 0.28;

    const fit = camera.aspect < 1 ? 0.78 : 1;
    world.position.set(pointer.x * 0.25, 0.25 - pointer.y * 0.15 + scrollP * 1.8, 0);
    world.scale.setScalar(intro.s * fit * (1 - scrollP * 0.25));
    world.rotation.set(pointer.y * 0.25, pointer.x * 0.45 + scrollP * 1.2, scrollP * 0.4);
    blob.rotation.y += dt * 0.12;

    sats.forEach((s) => {
      const d = s.userData;
      const a = d.phase + t * d.speed;
      s.position.set(Math.cos(a) * d.r, d.y + Math.sin(a * 1.3) * 0.25 + Math.sin(a) * d.tilt, Math.sin(a) * d.r * 0.6);
      s.rotation.x += d.spin.x * dt;
      s.rotation.y += d.spin.y * dt;
    });

    renderer.render(scene, camera);
  };

  let visible = true;
  const setLoop = () => renderer.setAnimationLoop(visible && !document.hidden ? tick : null);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; setLoop(); }).observe(canvas);
  document.addEventListener('visibilitychange', setLoop);
  setLoop();

  return {
    intro() {
      if (reduce) return;
      gsap.to(intro, { s: 1, duration: 2.2, ease: 'elastic.out(1, 0.45)' });
      gsap.fromTo(uniforms.uPoke, { value: 1.2 }, { value: 0, duration: 2.6, ease: 'power3.out' });
    },
  };
}
