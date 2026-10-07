"""Export the site as plain static files (GitHub Pages or any static host).

    python build.py                                              -> dist/
    SITE_URL=https://zqh7y.github.io/Portfolio/ python build.py  -> absolute og:image link

The page then runs without Python: data comes from dist/api/*.json, captured at
build time, and the egg lab rolls in the browser instead of on the server.
"""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

import app as site

OUT = site.ROOT / "dist"
BASE = "http://localhost/"


def build(out: Path = OUT, site_url: str | None = None) -> Path:
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(site.ROOT / "static", out / "static")

    api = out / "api"
    api.mkdir()
    repos = {**site.repos_payload(), "source": "static"}
    stats = {**site.stats_payload(), "source": "static"}
    for name, data in {
        "profile.json": site.public_profile(),
        "repos.json": repos,
        "stats.json": stats,
        "odds.json": site.odds_payload(),
    }.items():
        (api / name).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    with site.app.test_request_context("/", base_url=BASE):
        html = site.render_page(static=True)
    # root-relative /static/... -> ./static/... so the site works from any sub-path
    # (import maps need the leading "./", a bare "static/..." counts as a package name)
    html = html.replace(f"{BASE}static/", f"{site_url.rstrip('/')}/static/" if site_url else "./static/")
    html = html.replace('"/static/', '"./static/')
    (out / "index.html").write_text(html, encoding="utf-8")
    (out / ".nojekyll").touch()  # serve files as-is on GitHub Pages
    return out


if __name__ == "__main__":
    path = build(site_url=os.environ.get("SITE_URL"))
    print(f"built {path}")
