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


@app.get("/")
def index():
    return render_template("index.html", p=PROFILE, year=datetime.now().year)


@app.get("/api/profile")
def api_profile():
    public = {k: v for k, v in PROFILE.items() if k not in ("hidden_repos", "description_overrides")}
    return jsonify(public)


@app.get("/api/repos")
def api_repos():
    return jsonify(github.get_repos(PROFILE, SNAPSHOT))


@app.get("/api/stats")
def api_stats():
    feed = github.get_repos(PROFILE, SNAPSHOT)
    return jsonify({"source": feed["source"], **github.stats(feed["repos"], PROFILE["since"])})


@app.post("/api/hatch")
def api_hatch():
    return jsonify(hatch.hatch())


@app.get("/api/hatch/odds")
def api_hatch_odds():
    return jsonify([
        {**{k: pet[k] for k in ("id", "name", "rarity")}, "chance_label": hatch.format_odds(pet["odds"])}
        for pet in hatch.PETS + hatch.COMMONS
    ])


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
