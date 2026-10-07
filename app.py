"""
zzqxck — portfolio backend.

A tiny Flask server that renders the portfolio and exposes the profile data
as JSON. Live GitHub repo data is fetched (and cached) so the projects grid
can stay fresh, falling back to the bundled data/profile.json when offline.
"""

import json
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError

from flask import Flask, jsonify, render_template, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data" / "profile.json"
GITHUB_USER = "zqh7y"

app = Flask(__name__, static_folder="static", template_folder="templates")

# --- simple in-memory cache for live GitHub data ---------------------------
_cache = {"repos": None, "ts": 0.0}
_CACHE_TTL = 60 * 30  # 30 minutes


def load_profile():
    with open(DATA_FILE, "r", encoding="utf-8") as fh:
        return json.load(fh)


def fetch_github_repos():
    """Fetch public repos from GitHub, cached. Returns [] on any failure."""
    now = time.time()
    if _cache["repos"] is not None and (now - _cache["ts"]) < _CACHE_TTL:
        return _cache["repos"]

    url = f"https://api.github.com/users/{GITHUB_USER}/repos?per_page=100&sort=pushed"
    req = Request(url, headers={"User-Agent": "zzqxck-portfolio"})
    try:
        with urlopen(req, timeout=6) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
        repos = [
            {
                "name": r["name"],
                "description": r.get("description") or "",
                "language": r.get("language"),
                "stars": r.get("stargazers_count", 0),
                "url": r.get("html_url"),
                "pushed_at": r.get("pushed_at"),
            }
            for r in raw
            if not r.get("fork")
        ]
        repos.sort(key=lambda r: (r["stars"], r["pushed_at"] or ""), reverse=True)
        _cache["repos"] = repos
        _cache["ts"] = now
        return repos
    except (URLError, KeyError, ValueError, TimeoutError):
        return []


@app.route("/")
def index():
    return render_template("index.html", profile=load_profile())


@app.route("/api/profile")
def api_profile():
    return jsonify(load_profile())


@app.route("/api/repos")
def api_repos():
    """Live GitHub repos, falling back to the curated project list."""
    repos = fetch_github_repos()
    if not repos:
        repos = load_profile().get("projects", [])
    return jsonify({"repos": repos, "source": "github" if _cache["repos"] else "local"})


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/favicon.ico")
def favicon():
    return send_from_directory(app.static_folder, "assets/favicon.svg")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
