"""zzqxck portfolio: Flask serves the page and a small JSON API.

    python app.py            -> http://localhost:5000
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, render_template

from backend import github, hatch

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
SNAPSHOT = DATA / "repos_snapshot.json"

app = Flask(__name__, static_folder="static", template_folder="templates")


def load_profile() -> dict:
    with (DATA / "profile.json").open(encoding="utf-8") as f:
        return json.load(f)


PROFILE = load_profile()


def render_page(static: bool = False) -> str:
    return render_template("index.html", p=PROFILE, year=datetime.now().year, static_build=static)


def public_profile() -> dict:
    return {k: v for k, v in PROFILE.items() if k not in ("hidden_repos", "description_overrides")}


def repos_payload() -> dict:
    return github.get_repos(PROFILE, SNAPSHOT)


def stats_payload() -> dict:
    feed = repos_payload()
    return {"source": feed["source"], **github.stats(feed["repos"], PROFILE["since"])}


def odds_payload() -> list[dict]:
    return [
        {**{k: pet[k] for k in ("id", "name", "rarity")}, "chance_label": hatch.format_odds(pet["odds"])}
        for pet in hatch.PETS + hatch.COMMONS
    ]


@app.get("/")
def index():
    return render_page()


# The .json routes are what the page fetches; build.py writes the same files for static hosting.
@app.get("/api/profile")
@app.get("/api/profile.json")
def api_profile():
    return jsonify(public_profile())


@app.get("/api/repos")
@app.get("/api/repos.json")
def api_repos():
    return jsonify(repos_payload())


@app.get("/api/stats")
@app.get("/api/stats.json")
def api_stats():
    return jsonify(stats_payload())


@app.post("/api/hatch")
def api_hatch():
    return jsonify(hatch.hatch())


@app.get("/api/hatch/odds")
@app.get("/api/odds.json")
def api_hatch_odds():
    return jsonify(odds_payload())


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.after_request
def cache_headers(res):
    if res.mimetype == "application/json":
        res.headers["Cache-Control"] = "no-store"
    return res


if __name__ == "__main__":
    app.run(
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", 5000)),
        debug=os.environ.get("FLASK_DEBUG") == "1",
    )
