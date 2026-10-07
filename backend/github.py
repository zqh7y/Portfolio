"""Live GitHub repo feed with an in-memory cache and an offline snapshot fallback."""

from __future__ import annotations

import json
import os
import threading
import time
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

API_URL = "https://api.github.com/users/{user}/repos?per_page=100&sort=pushed"
CACHE_TTL = 15 * 60  # seconds
TIMEOUT = 4  # seconds

_KEEP = (
    "name", "description", "language", "stargazers_count", "forks_count",
    "topics", "homepage", "created_at", "pushed_at", "fork", "html_url",
)

_lock = threading.Lock()
_cache: dict = {"at": 0.0, "payload": None}


def _fetch_live(user: str) -> list[dict]:
    req = urllib.request.Request(
        API_URL.format(user=user),
        headers={"Accept": "application/vnd.github+json", "User-Agent": f"{user}-portfolio"},
    )
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
        data = json.load(res)
    if not isinstance(data, list):
        raise ValueError("unexpected GitHub response")
    return [{k: repo.get(k) for k in _KEEP} for repo in data]


def _load_snapshot(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as f:
        return json.load(f)["repos"]


def _clean(repos: list[dict], profile: dict) -> list[dict]:
    hidden = {name.lower() for name in profile.get("hidden_repos", [])}
    overrides = profile.get("description_overrides", {})
    play = profile.get("play_store", {})
    out = []
    for repo in repos:
        if repo["name"].lower() in hidden or repo.get("fork"):
            continue
        repo = dict(repo)
        repo["description"] = overrides.get(repo["name"], repo.get("description") or "")
        repo["topics"] = repo.get("topics") or []
        repo["play_store"] = play.get(repo["name"])  # None = not on Google Play
        out.append(repo)
    out.sort(key=lambda r: r.get("pushed_at") or "", reverse=True)
    return out


def get_repos(profile: dict, snapshot_path: Path, *, fetch=None) -> dict:
    """Return {"source", "fetched_at", "repos"}; live data is cached for CACHE_TTL."""
    with _lock:
        if _cache["payload"] and time.monotonic() - _cache["at"] < CACHE_TTL:
            return _cache["payload"]
        try:
            repos, source = (fetch or _fetch_live)(profile["github_user"]), "live"
        except Exception:
            repos, source = _load_snapshot(snapshot_path), "snapshot"
        payload = {
            "source": source,
            "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "repos": _clean(repos, profile),
        }
        _cache.update(at=time.monotonic(), payload=payload)
        return payload


def clear_cache() -> None:
    with _lock:
        _cache.update(at=0.0, payload=None)


def stats(repos: list[dict], since: int) -> dict:
    """Language breakdown + headline numbers for the repo list."""
    langs = Counter(r["language"] for r in repos if r.get("language"))
    total = sum(langs.values()) or 1
    return {
        "repo_count": len(repos),
        "stars": sum(r.get("stargazers_count") or 0 for r in repos),
        "years": max(datetime.now(timezone.utc).year - since, 1),
        "languages": [
            {"name": name, "count": count, "share": round(count / total, 4)}
            for name, count in langs.most_common()
        ],
    }
