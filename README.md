# zzqxck — portfolio

A cool, minimalist, white-themed personal site with heavy motion and 3D —
built the way a 2026 niche-teen dev site should feel.

Runs with **JavaScript** (frontend / Three.js / GSAP) + **Python** (Flask backend).

## Stack
- **Backend:** Python · Flask — serves the page + a tiny JSON API that pulls my
  live GitHub repos (cached, with an offline fallback).
- **Frontend:** vanilla JS, [Three.js](https://threejs.org) for the hero 3D scene,
  [GSAP + ScrollTrigger](https://gsap.com) for motion, [Lenis](https://lenis.darkroom.engineering)
  for smooth scroll, a CSS 3D cube for the stack section.

## Features
- WebGL hero: a morphing wireframe knot + particle field that drifts with the cursor and reacts to scroll.
- Custom blend-mode cursor, magnetic buttons, 3D tilt + glare cards.
- Animated preloader, char-by-char title reveals, scroll-scrubbed text, counting stats.
- Live GitHub repo count via `/api/repos`.
- Fully responsive + honors `prefers-reduced-motion`.

## Run it

```bash
pip install -r requirements.txt
python app.py
```

Then open http://localhost:5000

## Structure
```
app.py                # Flask server + GitHub API proxy
data/profile.json     # all the editable content (name, projects, skills…)
templates/index.html  # page markup
static/css/style.css  # styles
static/js/scene.js    # three.js hero scene
static/js/main.js      # interactions, loader, animations
```

To change any text or projects, edit **`data/profile.json`** — no code needed.
