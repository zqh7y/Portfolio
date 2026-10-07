// Copies the browser builds of our JS libraries from node_modules into
// static/vendor so the site has no CDN dependency. Run: npm install && npm run vendor
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = join(root, 'static', 'vendor');

const files = {
  'three/build/three.module.min.js': 'three/three.module.min.js',
  'three/examples/jsm/environments/RoomEnvironment.js': 'three/addons/environments/RoomEnvironment.js',
  'three/examples/jsm/geometries/RoundedBoxGeometry.js': 'three/addons/geometries/RoundedBoxGeometry.js',
  'three/LICENSE': 'three/LICENSE',
  'gsap/dist/gsap.min.js': 'gsap.min.js',
  'gsap/dist/ScrollTrigger.min.js': 'ScrollTrigger.min.js',
  'lenis/dist/lenis.min.js': 'lenis.min.js',
  'lenis/dist/lenis.css': 'lenis.css',
};

for (const [from, to] of Object.entries(files)) {
  const dest = join(out, to);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(join(nm, from), dest);
  console.log(`vendored ${to}`);
}
