// The lab: a 3D egg on a pedestal. Hatching asks the Python server for a roll,
// cracks the egg and pops out a little cube pet (Pet Park style).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const RARITY_COLORS = {
  common: '#bdbdbd',
  uncommon: '#45d05a',
  rare: '#2f95ff',
  epic: '#a24dff',
  legendary: '#ffbb00',
  mythical: '#ff2e55',
  secret: '#d4ff3a',
};
const RARITY_RANK = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythical', 'secret'];

const PETS = {
  dog: { body: '#e9b98a', ear: '#a8744a', ears: 'floppy', snout: '#f8dfc4' },
  cat: { body: '#ffb25e', ear: '#ffb25e', ears: 'pointy', snout: '#fff1df' },
  bunny: { body: '#fbfbfb', ear: '#fbfbfb', inner: '#ffb3c7', ears: 'long', snout: '#ffe8ef' },
  fox: { body: '#ff7a2f', ear: '#ff7a2f', ears: 'pointy', snout: '#fff3e6' },
  penguin: { body: '#1d1d22', ears: 'none', face: '#ffffff', beak: '#ffa31a' },
  axolotl: { body: '#ffa6cf', ears: 'gills', gill: '#ff4f9a', snout: '#ffc4df' },
  dragon: { body: '#ff4f5e', ears: 'horns', horn: '#ffd23f', wing: '#ff9a3d', snout: '#ffb3a1' },
  dev: { body: '#0b0b0c', ears: 'antenna', eye: '#d4ff3a' },
};

// Used only if the Python API is unreachable (e.g. static hosting).
const LOCAL_TABLE = [
  ['dev', 'zzqxck', 'secret', 1e6], ['dragon', 'Dragon', 'mythical', 1000], ['axolotl', 'Axolotl', 'legendary', 250],
  ['penguin', 'Penguin', 'epic', 60], ['fox', 'Fox', 'rare', 15], ['bunny', 'Bunny', 'uncommon', 5],
];

export function formatOdds(n) {
  for (const [lim, s] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) {
    if (n >= lim) {
      const v = n / lim;
      return `1 in ${v < 100 ? +v.toFixed(1) : Math.round(v)}${s}`;
    }
  }
  return `1 in ${n < 10 ? +n.toFixed(2) : Math.round(n)}`;
}

function localRoll() {
  let u = Math.random(), acc = 0;
  let pet = null;
  for (const [id, name, rarity, odds] of LOCAL_TABLE) {
    acc += 1 / odds;
    if (u < acc) { pet = { id, name, rarity, odds }; break; }
  }
  if (!pet) {
    const left = 1 - acc;
    pet = u - acc < left / 2
      ? { id: 'dog', name: 'Doggy', rarity: 'common', odds: 2 / left }
      : { id: 'cat', name: 'Kitty', rarity: 'common', odds: 2 / left };
  }
  const s = Math.random();
  const [size, sizeOdds] = s < 1 / 1000 ? ['titanic', 1000] : s < 1 / 1000 + 1 / 100 ? ['huge', 100] : ['normal', 1];
  const shiny = Math.random() < 1 / 50;
  const chance = pet.odds * sizeOdds * (shiny ? 50 : 1);
  return { pet, size, shiny, chance, chance_label: formatOdds(chance) };
}

const STATIC_SITE = document.querySelector('meta[name="site-mode"]')?.content === 'static';

async function rollFromServer() {
  if (STATIC_SITE) return localRoll();
  try {
    const res = await fetch('api/hatch', { method: 'POST' });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch {
    return localRoll();
  }
}

// ── geometry helpers ────────────────────────────────────
const box = (w, h, d, r = 0.05) => new RoundedBoxGeometry(w, h, d, 4, r);
const mat = (color, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.3, ...extra });

function makePet(result) {
  const spec = PETS[result.pet.id] ?? PETS.dog;
  const shiny = result.shiny;
  const pet = new THREE.Group();
  const body = new THREE.Group();
  pet.add(body);
  const add = (geo, material, pos, rot = [0, 0, 0], scale = [1, 1, 1]) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(...pos);
    m.rotation.set(...rot);
    m.scale.set(...scale);
    m.castShadow = true;
    body.add(m);
    return m;
  };

  const bodyMat = shiny
    ? mat(spec.body, { iridescence: 1, iridescenceIOR: 1.8, metalness: 0.35, roughness: 0.18, clearcoat: 1 })
    : mat(spec.body);
  const dark = new THREE.Color(spec.body).multiplyScalar(0.72);

  add(box(1, 1, 1, 0.2), bodyMat, [0, 0.55, 0]);

  // face
  const eyeMat = spec.eye
    ? new THREE.MeshStandardMaterial({ color: spec.eye, emissive: spec.eye, emissiveIntensity: 1.6 })
    : new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.2 });
  const white = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const pink = new THREE.MeshBasicMaterial({ color: '#ff8fb1', transparent: true, opacity: 0.65 });
  if (spec.face) add(box(0.78, 0.62, 0.06, 0.03), mat(spec.face), [0, 0.5, 0.49]);
  for (const sx of [-1, 1]) {
    add(new THREE.SphereGeometry(0.095, 24, 24), eyeMat, [sx * 0.2, 0.66, 0.5], [0, 0, 0], [1, 1.2, 0.5]);
    if (!spec.eye) add(new THREE.SphereGeometry(0.032, 12, 12), white, [sx * 0.2 + 0.03, 0.7, 0.545]);
    add(new THREE.CircleGeometry(0.07, 24), pink, [sx * 0.33, 0.5, 0.503]);
  }
  if (spec.snout) {
    add(box(0.34, 0.2, 0.06, 0.03), mat(spec.snout), [0, 0.43, 0.51]);
    add(new THREE.SphereGeometry(0.045, 16, 16), eyeMat, [0, 0.49, 0.55], [0, 0, 0], [1.3, 1, 0.8]);
  }
  if (spec.beak) add(new THREE.ConeGeometry(0.07, 0.18, 16), mat(spec.beak), [0, 0.48, 0.58], [Math.PI / 2, 0, 0]);

  // ears & extras
  const earMat = mat(spec.ear ?? spec.body);
  for (const sx of [-1, 1]) {
    switch (spec.ears) {
      case 'pointy':
        add(new THREE.ConeGeometry(0.18, 0.32, 4), earMat, [sx * 0.3, 1.18, 0], [0, Math.PI / 4, -sx * 0.25]);
        break;
      case 'floppy':
        add(box(0.16, 0.44, 0.32, 0.06), earMat, [sx * 0.56, 0.78, 0], [0, 0, sx * 0.25]);
        break;
      case 'long':
        add(new THREE.CapsuleGeometry(0.09, 0.42, 8, 16), earMat, [sx * 0.2, 1.36, 0], [0, 0, -sx * 0.12]);
        add(new THREE.CapsuleGeometry(0.045, 0.32, 8, 16), mat(spec.inner), [sx * 0.2, 1.36, 0.07], [0, 0, -sx * 0.12]);
        break;
      case 'gills':
        for (let i = 0; i < 3; i++) {
          add(new THREE.CapsuleGeometry(0.045, 0.2, 6, 12), mat(spec.gill), [sx * 0.6, 0.62 + i * 0.16, 0], [0, 0, sx * (0.9 + i * 0.35 - 0.35)]);
        }
        break;
      case 'horns':
        add(new THREE.ConeGeometry(0.08, 0.28, 16), mat(spec.horn), [sx * 0.26, 1.18, -0.05], [0, 0, -sx * 0.2]);
        add(new THREE.ConeGeometry(0.42, 0.7, 3), mat(spec.wing), [sx * 0.72, 0.85, -0.3], [0, 0, -sx * 1.1], [1, 1, 0.12]);
        break;
      case 'antenna':
        if (sx === 1) {
          add(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 8), mat('#0b0b0c'), [0, 1.2, 0]);
          add(new THREE.SphereGeometry(0.08, 16, 16), eyeMat, [0, 1.38, 0]);
        }
        break;
      case 'none':
        add(box(0.12, 0.38, 0.26, 0.05), mat(spec.body), [sx * 0.55, 0.45, 0], [0, 0, sx * 0.35]);
        break;
    }
    // feet
    add(box(0.24, 0.12, 0.3, 0.05), mat(spec.beak ?? `#${dark.getHexString()}`), [sx * 0.24, 0.06, 0.06]);
  }

  // crown for huge / titanic
  if (result.size !== 'normal') {
    const gold = new THREE.MeshPhysicalMaterial({ color: '#ffcc33', metalness: 1, roughness: 0.25 });
    const crownY = ['long', 'pointy', 'horns', 'antenna'].includes(spec.ears) ? 1.42 : 1.12;
    const crown = new THREE.Group();
    crown.position.set(0, crownY, 0);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.1, 5, 1, true), gold);
    band.material.side = THREE.DoubleSide;
    crown.add(band);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 8), gold);
      spike.position.set(Math.sin(a) * 0.24, 0.12, Math.cos(a) * 0.24);
      crown.add(spike);
    }
    crown.rotation.z = 0.12;
    body.add(crown);
  }

  pet.userData.size = { normal: 1, huge: 1.4, titanic: 1.8 }[result.size] ?? 1;
  return pet;
}

function disposeTree(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose(); m.dispose(); });
  });
}

function eggTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  const colors = ['#d4ff3a', '#c9b8ff', '#a8dcff', '#d4ff3a', '#0b0b0c'];
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * c.width, y = 150 + Math.random() * (c.height - 300);
    const r = 10 + Math.random() * 18;
    g.fillStyle = colors[i % colors.length];
    for (const dx of [0, c.width, -c.width]) {
      g.beginPath();
      g.ellipse(x + dx, y, r, r * 1.6, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Lathe profile for half an egg; `from`/`to` in [0, 1] from bottom to top.
function eggHalf(from, to, texture) {
  const pts = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const th = Math.PI * (from + (to - from) * (i / steps));
    pts.push(new THREE.Vector2(Math.sin(th) * 0.72 * (1 + 0.16 * Math.cos(th)), -Math.cos(th) * 0.98));
  }
  const geo = new THREE.LatheGeometry(pts, 96);
  // remap v so the texture spans the whole egg, not each half
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, from + (to - from) * uv.getY(i));
  const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
    map: texture, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12, side: THREE.DoubleSide,
  }));
  m.castShadow = true;
  return m;
}

export function initEggLab(canvas, { gsap, reduce, onResult }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.8;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
  const lookAt = new THREE.Vector3(0, 1.05, 0);

  const sun = new THREE.DirectionalLight('#ffffff', 2.4);
  sun.position.set(2.5, 6, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.radius = 6;
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 20 });
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.12 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(1.25, 1.35, 0.26, 96),
    new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.3, clearcoat: 1 }),
  );
  pedestal.position.y = 0.13;
  pedestal.receiveShadow = pedestal.castShadow = true;
  scene.add(pedestal);

  const ringMat = new THREE.MeshStandardMaterial({ color: '#0b0b0c', emissive: '#000000', roughness: 0.3 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.03, 16, 160), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.27;
  scene.add(ring);

  // light beam for big pulls
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color('#ffffff') }, uAlpha: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv; void main(){ gl_FragColor = vec4(uColor, pow(1.0 - vUv.y, 1.6) * uAlpha); }',
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.25, 7, 64, 1, true), beamMat);
  beam.position.y = 3.75;
  scene.add(beam);

  // confetti
  const CONFETTI = 160;
  const confetti = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.07, 0.07, 0.015),
    new THREE.MeshStandardMaterial({ roughness: 0.4 }),
    CONFETTI,
  );
  confetti.frustumCulled = false;
  const parts = Array.from({ length: CONFETTI }, () => ({
    p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), s: new THREE.Vector3(), life: 0,
  }));
  const dummy = new THREE.Object3D();
  const hide = () => { for (let i = 0; i < CONFETTI; i++) { dummy.scale.setScalar(0); dummy.updateMatrix(); confetti.setMatrixAt(i, dummy.matrix); } confetti.instanceMatrix.needsUpdate = true; };
  hide();
  scene.add(confetti);

  const burst = (rarity) => {
    const palette = [RARITY_COLORS[rarity], '#0b0b0c', '#d4ff3a', '#ffffff', '#ff8fb1'];
    const col = new THREE.Color();
    parts.forEach((pt, i) => {
      pt.p.set((Math.random() - 0.5) * 0.4, 1.0, (Math.random() - 0.5) * 0.4);
      const a = Math.random() * Math.PI * 2, sp = 1.6 + Math.random() * 3.2;
      pt.v.set(Math.cos(a) * sp * 0.6, 3 + Math.random() * 4, Math.sin(a) * sp * 0.6);
      pt.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      pt.s.set(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5);
      pt.life = 1.6 + Math.random() * 1.2;
      confetti.setColorAt(i, col.set(palette[i % palette.length]));
    });
    confetti.instanceColor.needsUpdate = true;
  };

  // egg
  const texture = eggTexture();
  const egg = new THREE.Group();
  const eggBottom = eggHalf(0, 0.52, texture);
  const eggTop = eggHalf(0.52, 1, texture);
  egg.add(eggBottom, eggTop);
  const EGG_Y = 0.26 + 0.98;
  egg.position.y = EGG_Y;
  scene.add(egg);

  let pet = null;
  let state = 'idle';
  const pointer = { x: 0, y: 0 };
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1;
  });
  canvas.addEventListener('click', () => hatch());

  const resize = () => {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const dist = camera.aspect < 0.9 ? 9.4 : 7.6;
    camera.position.set(0, 2.1, dist);
    camera.lookAt(lookAt);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  const resetEgg = () => {
    eggTop.position.set(0, 0, 0);
    eggTop.rotation.set(0, 0, 0);
    eggBottom.scale.setScalar(1);
    egg.rotation.set(0, 0, 0);
    egg.scale.setScalar(1);
    egg.visible = true;
  };

  const flash = (rarity) => {
    const c = new THREE.Color(RARITY_COLORS[rarity]);
    ringMat.color.copy(c);
    ringMat.emissive.copy(c);
    gsap.fromTo(ringMat, { emissiveIntensity: 2.5 }, { emissiveIntensity: 0.4, duration: 1.6, ease: 'power2.out' });
    if (RARITY_RANK.indexOf(rarity) >= 4) {
      beamMat.uniforms.uColor.value.copy(c);
      gsap.timeline()
        .fromTo(beam.scale, { x: 0.2, z: 0.2 }, { x: 1, z: 1, duration: 0.5, ease: 'expo.out' }, 0)
        .fromTo(beamMat.uniforms.uAlpha, { value: 0 }, { value: 0.65, duration: 0.3 }, 0)
        .to(beamMat.uniforms.uAlpha, { value: 0, duration: 2.4, ease: 'power2.in' }, 0.6);
      gsap.fromTo(camera.position, { x: -0.08 }, { x: 0, duration: 0.8, ease: 'rough({strength: 2, points: 12, taper: "out", randomize: true})' });
    }
  };

  async function hatch() {
    if (state === 'rolling') return;
    const again = state === 'revealed';
    state = 'rolling';
    onResult?.({ phase: 'rolling' });

    if (again && pet) {
      const old = pet;
      pet = null;
      await gsap.to(old.scale, { x: 0, y: 0, z: 0, duration: 0.35, ease: 'back.in(2)' }).then();
      scene.remove(old);
      disposeTree(old);
      resetEgg();
      egg.position.y = EGG_Y + 3;
      await gsap.to(egg.position, { y: EGG_Y, duration: 0.7, ease: 'bounce.out' }).then();
    }

    const resultP = rollFromServer();
    const shake = gsap.timeline();
    const steps = reduce ? 2 : 7;
    for (let i = 0; i < steps; i++) {
      const amp = 0.08 + i * 0.045;
      shake.to(egg.rotation, { z: (i % 2 ? -1 : 1) * amp, duration: 0.11, ease: 'sine.inOut' });
    }
    shake.to(egg.scale, { x: 1.08, y: 0.9, z: 1.08, duration: 0.14, ease: 'power2.out' }, '-=0.1');
    const [result] = await Promise.all([resultP, shake.then()]);

    // crack
    egg.rotation.z = 0;
    egg.scale.set(1, 1, 1);
    gsap.to(eggTop.position, { y: 1.6, x: 0.6, duration: 0.7, ease: 'power3.out' });
    gsap.to(eggTop.rotation, { z: -1.2, x: 0.4, duration: 0.7, ease: 'power3.out' });
    gsap.to(eggTop.scale, { x: 0, y: 0, z: 0, duration: 0.4, delay: 0.35, ease: 'power2.in' });
    gsap.to(eggBottom.scale, { x: 0, y: 0, z: 0, duration: 0.45, delay: 0.1, ease: 'back.in(1.6)', onComplete: () => { egg.visible = false; eggTop.scale.setScalar(1); } });
    burst(result.pet.rarity);
    flash(result.pet.rarity);

    pet = makePet(result);
    pet.position.y = 0.26;
    pet.scale.setScalar(0.001);
    scene.add(pet);
    const s = pet.userData.size;
    await gsap.timeline()
      .to(pet.scale, { x: s, y: s, z: s, duration: 1.1, ease: 'elastic.out(1, 0.45)' }, 0.1)
      .fromTo(pet.position, { y: 0.26 }, { y: 1.4, duration: 0.35, ease: 'power2.out', yoyo: true, repeat: 1 }, 0.1)
      .fromTo(pet.rotation, { y: -Math.PI * 2 }, { y: 0, duration: 1.2, ease: 'expo.out' }, 0.1)
      .then();

    state = 'revealed';
    onResult?.({ phase: 'done', result });
  }

  // loop
  const clock = new THREE.Clock();
  let t = 0;
  const tick = () => {
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;
    if (state === 'idle') {
      egg.rotation.z = Math.sin(t * 1.6) * 0.04;
      egg.rotation.y += dt * 0.4;
    }
    if (pet && state === 'revealed') {
      const s = pet.userData.size;
      const hop = Math.abs(Math.sin(t * 3.2));
      pet.position.y = 0.26 + hop * 0.12 * s;
      pet.scale.set(s * (1 + (1 - hop) * 0.04), s * (1 - (1 - hop) * 0.06), s * (1 + (1 - hop) * 0.04));
      pet.rotation.y += (pointer.x * 0.7 - pet.rotation.y) * 0.08;
      pet.rotation.x += (pointer.y * 0.2 - pet.rotation.x) * 0.08;
    }
    ring.rotation.z += dt * 0.3;

    let alive = false;
    parts.forEach((pt, i) => {
      if (pt.life <= 0) return;
      alive = true;
      pt.life -= dt;
      pt.v.y -= 9.8 * dt * 0.7;
      pt.v.multiplyScalar(0.985);
      pt.p.addScaledVector(pt.v, dt);
      if (pt.p.y < 0.02) { pt.p.y = 0.02; pt.v.set(pt.v.x * 0.4, 0, pt.v.z * 0.4); }
      pt.r.x += pt.s.x * dt; pt.r.y += pt.s.y * dt;
      dummy.position.copy(pt.p);
      dummy.rotation.copy(pt.r);
      dummy.scale.setScalar(Math.min(pt.life, 1));
      dummy.updateMatrix();
      confetti.setMatrixAt(i, dummy.matrix);
    });
    if (alive) confetti.instanceMatrix.needsUpdate = true;

    renderer.render(scene, camera);
  };

  let visible = false;
  const setLoop = () => renderer.setAnimationLoop(visible && !document.hidden ? tick : null);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; setLoop(); }).observe(canvas);
  document.addEventListener('visibilitychange', setLoop);

  return { hatch, isVisible: () => visible };
}
