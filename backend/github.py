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
LANGS_URL = "https://api.github.com/repos/{user}/{name}/languages"
CACHE_TTL = 15 * 60  # seconds
TIMEOUT = 4  # seconds

_KEEP = (
    "name", "description", "language", "stargazers_count", "forks_count",
    "topics", "homepage", "created_at", "pushed_at", "fork", "html_url",
)

_lock = threading.Lock()
_cache: dict = {"at": 0.0, "payload": None}


def _get_json(url: str, user: str):
    req = urllib.request.Request(
        url, headers={"Accept": "application/vnd.github+json", "User-Agent": f"{user}-portfolio"},
    )
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
        return json.load(res)


def _fetch_live(user: str) -> list[dict]:
    data = _get_json(API_URL.format(user=user), user)
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
        repo["languages"] = repo.get("languages") or []
        repo["play_store"] = play.get(repo["name"])  # None = not on Google Play
        out.append(repo)
    out.sort(key=lambda r: r.get("pushed_at") or "", reverse=True)
    return out


def fetch_languages(user: str, name: str, min_share: float = 0.01) -> list[str]:
    """Every language GitHub found in one repo, biggest first (not just the main one).

    Languages under 1% of the code are left out: a few bytes of Java from the Android
    wrapper or one shell script don't make it a Java project.
    """
    data = _get_json(LANGS_URL.format(user=user, name=name), user)
    if not isinstance(data, dict) or not data:
        return []
    total = sum(data.values())
    return [lang for lang, size in sorted(data.items(), key=lambda kv: -kv[1]) if size / total >= min_share]


def _with_snapshot_languages(repos: list[dict], snapshot: list[dict]) -> list[dict]:
    # the per-repo language lists come from the daily sync (scripts/sync.py), not the live feed
    langs = {r["name"]: r["languages"] for r in snapshot if r.get("languages")}
    return [{**r, "languages": r.get("languages") or langs.get(r["name"], [])} for r in repos]


def get_repos(profile: dict, snapshot_path: Path, *, fetch=None) -> dict:
    """Return {"source", "fetched_at", "repos"}; live data is cached for CACHE_TTL."""
    with _lock:
        if _cache["payload"] and time.monotonic() - _cache["at"] < CACHE_TTL:
            return _cache["payload"]
        try:
            snapshot = _load_snapshot(snapshot_path)
        except (OSError, ValueError, KeyError):
            snapshot = []
        try:
            repos, source = (fetch or _fetch_live)(profile["github_user"]), "live"
            repos = _with_snapshot_languages(repos, snapshot)
        except Exception:
            repos, source = snapshot, "snapshot"
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
