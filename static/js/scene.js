/* =========================================================
   hero 3D scene — three.js
   a slowly-morphing wireframe knot + floating particles,
   drifting with the pointer. minimalist, monochrome.
   ========================================================= */
import * as THREE from "three";

const canvas = document.getElementById("webgl");
if (canvas && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const scene = new THREE.Scene();

  const sizes = { w: window.innerWidth, h: window.innerHeight };
  const camera = new THREE.PerspectiveCamera(42, sizes.w / sizes.h, 0.1, 100);
  camera.position.set(0, 0, 6);
  scene.add(camera);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setSize(sizes.w, sizes.h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // --- central morphing wireframe knot ---
  const knotGeo = new THREE.TorusKnotGeometry(1.5, 0.42, 180, 32, 2, 3);
  const knotMat = new THREE.MeshBasicMaterial({
    color: 0x0d0d0d,
    wireframe: true,
    transparent: true,
    opacity: 0.12,
  });
  const knot = new THREE.Mesh(knotGeo, knotMat);
  scene.add(knot);

  // --- a denser inner solid-ish ghost for depth ---
  const ghostGeo = new THREE.IcosahedronGeometry(0.9, 1);
  const ghostMat = new THREE.MeshBasicMaterial({
    color: 0x0d0d0d,
    wireframe: true,
    transparent: true,
    opacity: 0.08,
  });
  const ghost = new THREE.Mesh(ghostGeo, ghostMat);
  scene.add(ghost);

  // --- floating particle field ---
  const COUNT = 320;
  const positions = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT * 3; i++) {
    positions[i] = (Math.random() - 0.5) * 14;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const pMat = new THREE.PointsMaterial({
    color: 0x0d0d0d,
    size: 0.018,
    transparent: true,
    opacity: 0.5,
  });
  const particles = new THREE.Points(pGeo, pMat);
  scene.add(particles);

  // --- pointer parallax ---
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener("pointermove", (e) => {
    pointer.tx = (e.clientX / sizes.w - 0.5) * 2;
    pointer.ty = (e.clientY / sizes.h - 0.5) * 2;
  });

  // --- scroll drives the knot scale/rotation ---
  let scrollY = 0;
  window.addEventListener("scroll", () => {
    scrollY = window.scrollY;
  });

  const clock = new THREE.Clock();
  function tick() {
    const t = clock.getElapsedTime();

    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;

    knot.rotation.x = t * 0.1 + pointer.y * 0.3;
    knot.rotation.y = t * 0.15 + pointer.x * 0.3;
    const s = 1 + Math.sin(t * 0.5) * 0.06 - Math.min(scrollY, 800) / 2600;
    knot.scale.setScalar(s);

    ghost.rotation.x = -t * 0.2;
    ghost.rotation.y = -t * 0.12;

    particles.rotation.y = t * 0.02;
    particles.rotation.x = pointer.y * 0.1;

    camera.position.x += (pointer.x * 0.4 - camera.position.x) * 0.05;
    camera.position.y += (-pointer.y * 0.4 - camera.position.y) * 0.05;
    camera.lookAt(scene.position);

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();

  window.addEventListener("resize", () => {
    sizes.w = window.innerWidth;
    sizes.h = window.innerHeight;
    camera.aspect = sizes.w / sizes.h;
    camera.updateProjectionMatrix();
    renderer.setSize(sizes.w, sizes.h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  });
}
