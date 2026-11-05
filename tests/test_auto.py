"""The parts of the site that keep themselves up to date."""

import json
from datetime import datetime, timezone

import pytest

import app as portfolio
from backend import derive, github
from scripts import sync

NOW = datetime(2027, 3, 9, tzinfo=timezone.utc)


def repo(name, **kw):
    return {"name": name, "description": "", "language": None, "stargazers_count": 0, "forks_count": 0,
            "topics": [], "homepage": None, "created_at": "2026-12-01T00:00:00Z",
            "pushed_at": "2026-12-02T00:00:00Z", "fork": False, "html_url": f"https://github.com/zqh7y/{name}", **kw}


def test_years_now_and_games_follow_the_clock_and_cards():
    p = derive.derive(portfolio.PROFILE, [], now=NOW)
    years = next(f for f in p["facts"] if f.get("auto") == "years")
    assert years["value"] == 2027 - portfolio.PROFILE["since"]
    assert p["lore"][-1]["date"] == "mar 2027"
    games = next(pl for pl in p["pillars"] if pl["key"] == "games")
    assert games["count"] == str(sum(f["kind"].startswith("game") for f in portfolio.PROFILE["featured"]))
    assert p["updated"] == "9 mar 2027"


def test_language_counts_never_drop_below_the_hand_written_ones():
    base = [{"name": "Python", "repos": 4, "color": "#3572a5", "where": "x"}]
    repos = [repo("a", language="Go", languages=["Go", "Python"]), repo("b", language="Go"),
             repo("c", languages=["Python", "Makefile"])]
    langs = {lang["name"]: lang["repos"] for lang in derive._languages(base, repos)}
    assert langs == {"Python": 4, "Go": 2}


def test_auto_projects_go_first_until_written_up():
    card = {"id": "auto-newthing", "title": "New Thing", "kind": "game · typescript", "repo": "https://github.com/zqh7y/NewThing"}
    p = derive.derive(portfolio.PROFILE, [], [card], now=NOW)
    assert p["featured"][0]["title"] == "New Thing" and p["auto_count"] == 1
    written = {**portfolio.PROFILE, "featured": [*portfolio.PROFILE["featured"], {**card, "id": "newthing"}]}
    p = derive.derive(written, [], [card], now=NOW)
    assert p["auto_count"] == 0 and [f["id"] for f in p["featured"]].count("newthing") == 1


def test_newest_project_answer():
    featured = portfolio.PROFILE["featured"]
    repos = [repo(derive.repo_name(f["repo"]), created_at=f"2026-0{i + 1}-01T00:00:00Z") for i, f in enumerate(featured)]
    p = derive.derive(portfolio.PROFILE, repos, now=NOW)
    answer = next(q["a"] for q in p["qa"] if q.get("auto") == "newest")
    assert answer.startswith(featured[-1]["title"])


def test_known_repos_cover_everything_the_profile_mentions():
    known = derive.known_repos(portfolio.PROFILE)
    for name in ("driftwoodgame", "googleplay-game", "fakelive", "metzv2", "aidocx", "zqh7y", "roblox-automation"):
        assert name in known


README = """<p align="center"><img src="docs/banner.png" alt="banner"></p>

# Space Snail [![ci](https://img.shields.io/badge/ci-ok-green.svg)](x)

A slow but **determined** snail explores [space](https://example.com) in this tiny phone game. It has 40 levels.

![one](shots/1.png)
![two](https://github.com/zqh7y/SpaceSnail/blob/master/shots/2.png)
"""


def test_parse_readme():
    info = sync.parse_readme(README)
    assert info["title"] == "Space Snail"
    assert info["blurb"].startswith("A slow but determined snail explores space")
    assert info["images"] == ["docs/banner.png", "shots/1.png", "https://github.com/zqh7y/SpaceSnail/blob/master/shots/2.png"]
    assert sync._resolve("shots/1.png", "zqh7y", "SpaceSnail") == "https://raw.githubusercontent.com/zqh7y/SpaceSnail/HEAD/shots/1.png"
    assert sync._resolve(info["images"][2], "zqh7y", "SpaceSnail") == "https://raw.githubusercontent.com/zqh7y/SpaceSnail/master/shots/2.png"


@pytest.fixture
def sandbox(tmp_path, monkeypatch):
    (tmp_path / "static" / "img").mkdir(parents=True)
    monkeypatch.setattr(sync, "ROOT", tmp_path)
    monkeypatch.setattr(sync, "SNAPSHOT", tmp_path / "snapshot.json")
    monkeypatch.setattr(sync, "AUTO", tmp_path / "auto.json")
    monkeypatch.setattr(sync, "IMG_DIR", tmp_path / "static" / "img" / "auto")
    monkeypatch.setattr(sync, "_get", lambda url, user: (_ for _ in ()).throw(OSError("offline")))
    return tmp_path


def test_sync_writes_cards_for_new_repos_only(sandbox):
    repos = [repo("SpaceSnail", language="TypeScript", description="a snail game"),
             repo("DriftwoodGame", language="TypeScript"),       # already written up
             repo("OldThing", created_at="2023-01-01T00:00:00Z"),  # before auto_since
             repo("SomeFork", fork=True)]
    out = sync.sync(fetch=lambda user: [dict(r) for r in repos], languages=lambda user, name: ["TypeScript"],
                    readme=lambda user, name: README, now=NOW)
    assert out["new_projects"] == ["Space Snail"]
    cards = json.loads((sandbox / "auto.json").read_text())["projects"]
    card = cards[0]
    assert card["kind"] == "game · typescript" and card["badge"] == "new" and card["auto"]
    assert card["visual"] == "code"  # no pictures could be downloaded
    snap = json.loads((sandbox / "snapshot.json").read_text())
    assert [r["name"] for r in snap["repos"]] == [r["name"] for r in repos]
    assert snap["repos"][0]["languages"] == ["TypeScript"]

    # a second run with nothing new changes nothing
    before = (sandbox / "auto.json").read_text(), (sandbox / "snapshot.json").read_text()
    sync.sync(fetch=lambda user: [dict(r) for r in repos], languages=lambda user, name: ["TypeScript"],
              readme=lambda user, name: README, now=datetime(2027, 3, 10, tzinfo=timezone.utc))
    assert before == ((sandbox / "auto.json").read_text(), (sandbox / "snapshot.json").read_text())


def test_live_feed_keeps_languages_from_the_snapshot():
    github.clear_cache()
    payload = github.get_repos(portfolio.PROFILE, portfolio.SNAPSHOT, fetch=lambda _u: [repo("DriftwoodGame")])
    github.clear_cache()
    snap = {r["name"]: r for r in json.loads(portfolio.SNAPSHOT.read_text())["repos"]}
    assert payload["repos"][0]["languages"] == snap["DriftwoodGame"]["languages"]
