"""Numbers and dates on the page that keep themselves up to date.

profile.json holds the hand-written content. This module fills in everything that
would otherwise go stale: years since 2022, language counts, how many games there
are, the "now" entry of the timeline, the newest project, and project cards for
new repos that the daily sync (scripts/sync.py) found but nobody has written up yet.
"""

from __future__ import annotations

import re
from collections import Counter
from datetime import datetime, timezone

LANG_COLORS = {
    "JavaScript": "#f1e05a", "TypeScript": "#3178c6", "Python": "#3572a5", "Luau": "#00a2ff",
    "HTML": "#e34c26", "CSS": "#663399", "SCSS": "#c6538c", "SQL": "#e38c00", "YAML": "#cb171e",
    "Kotlin": "#a97bff", "Java": "#b07219", "Lua": "#000080", "C#": "#178600", "Shell": "#89e051",
}
# GitHub counts these in nearly every app repo; they say little about what I wrote
_NOISE_LANGS = {"Batchfile", "Makefile", "Dockerfile", "Procfile", "Ruby", "Objective-C", "Objective-C++", "Starlark"}

_REPO_RE = re.compile(r"github\.com/[^/]+/([^/?#]+)", re.I)


def repo_name(url: str | None) -> str | None:
    m = _REPO_RE.search(url or "")
    return m.group(1).removesuffix(".git") if m else None


def known_repos(profile: dict) -> set[str]:
    """Every repo the profile already talks about (lower-case names)."""
    names = {n.lower() for n in profile.get("hidden_repos", [])}
    names.add(profile.get("github_user", "").lower())  # the profile README repo
    for group in ("featured", "apps", "also_built"):
        for item in profile.get(group, []):
            for key in ("repo", "repo_name"):
                name = repo_name(item.get(key)) if key == "repo" else item.get(key)
                if name:
                    names.add(name.lower())
    metz = profile.get("metz", {})
    for url in [metz.get("repo"), *metz.get("repos", [])]:
        if repo_name(url):
            names.add(repo_name(url).lower())
    names.update(n.lower() for n in profile.get("auto_skip", []))
    return names


def month_label(when: datetime) -> str:
    return when.strftime("%b %Y").lower()


def _languages(base: list[dict], repos: list[dict]) -> list[dict]:
    """Repo counts per language: the hand-written count or the real one, whichever is higher."""
    auto = Counter()
    for r in repos:
        langs = r.get("languages") or ([r["language"]] if r.get("language") else [])
        auto.update({lang for lang in langs if lang not in _NOISE_LANGS})
    out, seen = [], set()
    for lang in base:
        out.append({**lang, "repos": max(lang.get("repos", 0), auto.get(lang["name"], 0))})
        seen.add(lang["name"])
    for name, count in auto.most_common():
        if name not in seen:
            out.append({"name": name, "repos": count, "color": LANG_COLORS.get(name, "#b5b5b5"), "where": ""})
    out.sort(key=lambda lang: -lang["repos"])  # stable: ties keep the hand-written order
    return out


def _count_from(spec: str, featured: list[dict]) -> int:
    # "featured:game" -> how many featured cards have a kind that starts with "game"
    group, _, prefix = spec.partition(":")
    if group != "featured":
        raise ValueError(f"unknown count_from: {spec}")
    return sum(1 for f in featured if f.get("kind", "").startswith(prefix))


def _first_sentence(text: str) -> str:
    m = re.match(r"(.+?[.!?])(\s|$)", text.strip())
    return (m.group(1) if m else text.strip())


def derive(profile: dict, repos: list[dict], auto_projects: list[dict] | None = None,
           now: datetime | None = None) -> dict:
    """Return a copy of the profile with every automatic value filled in."""
    now = now or datetime.now(timezone.utc)
    p = dict(profile)
    known = known_repos(profile)
    by_name = {r["name"].lower(): r for r in repos}

    # new repos the sync wrote up go first: they are the newest work
    fresh = [a for a in (auto_projects or []) if (repo_name(a.get("repo")) or "").lower() not in known]
    p["featured"] = fresh + list(profile.get("featured", []))
    p["auto_count"] = len(fresh)

    years = max(now.year - profile.get("since", now.year), 1)
    p["facts"] = [{**f, "value": years} if f.get("auto") == "years" else f for f in profile.get("facts", [])]

    p["pillars"] = [
        {**pl, "count": str(_count_from(pl["count_from"], p["featured"]))} if pl.get("count_from") else pl
        for pl in profile.get("pillars", [])
    ]

    p["languages"] = _languages(profile.get("languages", []), repos)

    p["lore"] = [{**item, "date": month_label(now)} if item.get("date") == "now" else item
                 for item in profile.get("lore", [])]

    newest = None
    for f in p["featured"]:
        repo = by_name.get((repo_name(f.get("repo")) or "").lower())
        created = (repo or {}).get("created_at") or ""
        if repo and (newest is None or created > newest[0]):
            newest = (created, f)
    qa = []
    for item in profile.get("qa", []):
        if item.get("auto") == "newest":
            if not newest:
                continue
            f = newest[1]
            when = datetime.fromisoformat(newest[0].replace("Z", "+00:00"))
            item = {**item, "a": f"{f['title']}, from {month_label(when)}. "
                                 f"{_first_sentence(f.get('blurb', '')).lower()}".strip()}
        qa.append(item)
    p["qa"] = qa

    pushed = [r for r in repos if r.get("pushed_at")]
    p["last_push"] = max(pushed, key=lambda r: r["pushed_at"]) if pushed else None
    p["updated"] = f"{now.day} {month_label(now)}"
    p["updated_iso"] = now.date().isoformat()
    return p
