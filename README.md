# zzqxck · portfolio

My personal site: Android apps, Roblox games and Python tools, in one white, very animated page.

- **Python (Flask)** renders the page from `data/profile.json` and serves a small JSON API.
- **JavaScript** (no build step) does everything that moves: GSAP + ScrollTrigger scroll animations, Lenis smooth scroll, and two **Three.js** scenes: a holographic chrome blob in the hero and an egg-hatching lab.

## Run it

```bash
pip install -r requirements.txt
python app.py
# → http://localhost:5000
```

The JS libraries are already vendored in `static/vendor/`, so npm is optional. To update them:

```bash
npm install
npm run vendor
```

## Tests

```bash
pip install -r requirements-dev.txt
python -m pytest
```

## What's where

| Path | What it does |
| --- | --- |
| `app.py` | Flask app: `/` page, `/api/repos`, `/api/stats`, `/api/hatch`, `/api/hatch/odds`, `/api/profile` |
| `backend/github.py` | Live repo feed from the GitHub API (cached 15 min). Falls back to `data/repos_snapshot.json` when offline |
| `backend/hatch.py` | Server-side egg rolls: the server rolls first, the browser just animates the result |
| `data/profile.json` | **All the text on the site**: bio, projects, timeline, Q&A, stack. Edit this to change content |
| `templates/index.html` | Page markup (Jinja) |
| `static/js/main.js` | Boot, loader, smooth scroll, scroll animations, lab UI |
| `static/js/hero-scene.js` | Three.js hero blob (custom noise shader + holographic studio lighting) |
| `static/js/egg-lab.js` | Three.js egg + cube pets + confetti |
| `static/js/tag-sphere.js` | Draggable 3D tag sphere |
| `static/js/fx.js` | Cursor, magnetic buttons, tilt, text scramble, stickers, marquees |
| `static/js/repos.js` | "The archive": every public repo with language filters |

## Editing content

Everything personal lives in `data/profile.json`:

- `qa`: the "rapid fire" flip cards. Add `{"q": "...", "a": "..."}` entries.
- `featured`: the big project cards (image paths are relative to `static/`).
- `lore`: the timeline.
- `hidden_repos` / `description_overrides`: control what the GitHub archive shows.
- `email`: leave empty to hide it, or set it to show a copy-to-clipboard button.

Set `GITHUB_TOKEN` in the environment if you hit GitHub's anonymous rate limit.

## Deploy

Any host that runs Python works (Render, Railway, Fly, a VPS). A `Procfile` is included:

```
web: gunicorn app:app --bind 0.0.0.0:$PORT
```
