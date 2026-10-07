import json
from collections import Counter
from random import Random

import pytest

import app as portfolio
from backend import github, hatch


@pytest.fixture
def client(monkeypatch):
    # never hit the real GitHub API from tests
    def offline(_user):
        raise OSError("offline")

    monkeypatch.setattr(github, "_fetch_live", offline)
    github.clear_cache()
    portfolio.app.config["TESTING"] = True
    with portfolio.app.test_client() as c:
        yield c
    github.clear_cache()


def test_index_renders_profile(client):
    res = client.get("/")
    assert res.status_code == 200
    html = res.get_data(as_text=True)
    assert portfolio.PROFILE["name"] in html
    for project in portfolio.PROFILE["featured"]:
        assert project["title"] in html
    for item in portfolio.PROFILE["qa"]:
        assert item["q"] in html


def test_repos_fall_back_to_snapshot(client):
    data = client.get("/api/repos").get_json()
    assert data["source"] == "snapshot"
    names = {r["name"].lower() for r in data["repos"]}
    assert names, "snapshot should not be empty"
    for hidden in portfolio.PROFILE["hidden_repos"]:
        assert hidden.lower() not in names


def test_repos_use_live_data_and_overrides():
    github.clear_cache()
    live = [
        {"name": "BuyList", "description": "old text", "language": "JavaScript", "pushed_at": "2024-01-01T00:00:00Z", "fork": False},
        {"name": "roblox-automation", "description": "", "language": "Python", "pushed_at": "2026-01-01T00:00:00Z", "fork": False},
        {"name": "someone-elses-fork", "description": "", "language": "Go", "pushed_at": "2026-02-01T00:00:00Z", "fork": True},
    ]
    payload = github.get_repos(portfolio.PROFILE, portfolio.SNAPSHOT, fetch=lambda _user: live)
    github.clear_cache()
    assert payload["source"] == "live"
    assert [r["name"] for r in payload["repos"]] == ["BuyList"]
    assert payload["repos"][0]["description"] == portfolio.PROFILE["description_overrides"]["BuyList"]
    assert payload["repos"][0]["play_store"] is None


def test_play_store_apps_are_flagged(client):
    repos = {r["name"]: r for r in client.get("/api/repos").get_json()["repos"]}
    assert repos["fakeLive"]["play_store"] == "10K+"
    assert repos["NetBook"]["play_store"] == ""
    assert repos["MetzV2"]["play_store"] is None


def test_stats_shape(client):
    data = client.get("/api/stats").get_json()
    assert data["repo_count"] > 0
    assert abs(sum(lang["share"] for lang in data["languages"]) - 1) < 0.01
    assert data["years"] >= 1


def test_hatch_endpoint(client):
    data = client.post("/api/hatch").get_json()
    assert data["pet"]["rarity"] in {"common", "uncommon", "rare", "epic", "legendary", "mythical", "secret"}
    assert data["size"] in {"normal", "huge", "titanic"}
    assert data["chance_label"].startswith("1 in ")
    assert client.get("/api/hatch").status_code == 405


def test_hatch_probabilities_sum_to_one():
    assert abs(sum(hatch.probabilities().values()) - 1) < 1e-9


def test_hatch_distribution_roughly_matches_odds():
    rng = Random(7)
    counts = Counter(hatch.hatch(rng)["pet"]["id"] for _ in range(60_000))
    assert counts["bunny"] / 60_000 == pytest.approx(1 / 5, rel=0.05)
    assert counts["fox"] / 60_000 == pytest.approx(1 / 15, rel=0.1)
    assert counts["dog"] / 60_000 == pytest.approx(counts["cat"] / 60_000, rel=0.05)


@pytest.mark.parametrize("n, label", [
    (2.8103, "1 in 2.81"), (5, "1 in 5"), (60, "1 in 60"), (1000, "1 in 1K"),
    (12_500, "1 in 12.5K"), (6_000_000, "1 in 6M"), (5e10, "1 in 50B"), (250_000, "1 in 250K"),
])
def test_format_odds(n, label):
    assert hatch.format_odds(n) == label


def test_profile_json_is_valid():
    with (portfolio.DATA / "profile.json").open(encoding="utf-8") as f:
        profile = json.load(f)
    for key in ("name", "github_user", "featured", "lore", "stack", "qa"):
        assert key in profile


def test_json_routes_match_plain_routes(client):
    assert client.get("/api/repos.json").get_json()["repos"] == client.get("/api/repos").get_json()["repos"]
    assert client.get("/api/odds.json").get_json() == client.get("/api/hatch/odds").get_json()
    assert client.get("/api/stats.json").status_code == 200
    assert "hidden_repos" not in client.get("/api/profile.json").get_json()


def test_static_build(tmp_path, monkeypatch):
    import build

    monkeypatch.setattr(github, "_fetch_live", lambda _user: (_ for _ in ()).throw(OSError("offline")))
    github.clear_cache()
    out = build.build(tmp_path / "dist", site_url="https://example.com/site/")
    github.clear_cache()
    html = (out / "index.html").read_text(encoding="utf-8")
    assert '"/static/' not in html
    assert 'src="./static/js/main.js"' in html
    assert '"three": "./static/vendor/three/three.module.min.js"' in html
    assert 'content="https://example.com/site/static/img/og.jpg"' in html
    for name in ("repos.json", "stats.json", "odds.json", "profile.json"):
        assert (out / "api" / name).is_file()
    repos = json.loads((out / "api" / "repos.json").read_text(encoding="utf-8"))
    assert repos["source"] == "static"
    assert (out / "static" / "js" / "main.js").is_file()
