"""Daily sync: keep the site's project data in step with GitHub.

    python scripts/sync.py              # refresh data/ and static/img/auto/
    python scripts/sync.py --preview X  # print the card it would write for repo X, change nothing

GitHub Actions runs this every day (.github/workflows/pages.yml) and commits what changed.
It does three things:

1. Refreshes data/repos_snapshot.json (every public repo, plus every language in each one),
   so the archive, the language counts and the offline fallback stay current.
2. Writes a project card into data/auto_projects.json for every new repo that profile.json
   doesn't mention yet: title and blurb from its README, pictures from its README
   (saved as webp under static/img/auto/), stack from its languages and topics.
   The card shows up first in "games & programs" with a "new" badge.
3. Drops a card again once you write the project up by hand in profile.json
   (or add the repo to "hidden_repos" / "auto_skip").

Only repos created on or after profile["auto_since"] get a card, so old experiments stay
in the archive only. Set GITHUB_TOKEN to avoid GitHub's anonymous rate limit.
"""

from __future__ import annotations

import argparse
import io
import json
import re
import shutil
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend import derive, github  # noqa: E402

DATA = ROOT / "data"
PROFILE = DATA / "profile.json"
SNAPSHOT = DATA / "repos_snapshot.json"
AUTO = DATA / "auto_projects.json"
IMG_DIR = ROOT / "static" / "img" / "auto"
RAW = "https://raw.githubusercontent.com/{user}/{name}/HEAD/"
TIMEOUT = 10
MAX_IMAGE_BYTES = 8 * 1024 * 1024
TINTS = ["#7c4dff", "#ff4fb3", "#4f6bed", "#ff8a3d", "#16a34a", "#0ea5e9", "#e11d48", "#a855f7"]


def _get(url: str, user: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": f"{user}-portfolio-sync"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
        return res.read(MAX_IMAGE_BYTES + 1)


# ───────────── README → title, blurb, pictures ─────────────

_MD_IMG = re.compile(r"!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)")
_HTML_IMG = re.compile(r"<img\b[^>]*\bsrc=[\"']([^\"']+)[\"'][^>]*>", re.I)
_BADGE = re.compile(r"shields\.io|badge|badgen|travis-ci|codecov|actions/workflows|\.svg(\?|$)", re.I)


def _plain(md: str) -> str:
    md = _MD_IMG.sub("", md)
    md = re.sub(r"\[\s*\]\([^)]*\)", "", md)               # links left empty by a removed badge
    md = re.sub(r"<[^>]+>", "", md)
    md = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", md)       # [text](link) -> text
    md = re.sub(r"(\*\*|__|\*|_|`)(.+?)\1", r"\2", md)       # bold / italic / code
    return re.sub(r"\s+", " ", md).strip()


def _clip(text: str, limit: int = 280) -> str:
    if len(text) <= limit:
        return text
    cut = text[:limit]
    end = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
    return cut[: end + 1] if end > 80 else cut.rsplit(" ", 1)[0] + "…"


def parse_readme(md: str) -> dict:
    """Pull a title, a blurb and the picture links out of a README."""
    title, blurb = None, None
    for block in re.split(r"\n\s*\n", md):
        lines = [ln for ln in block.strip().splitlines() if ln.strip()]
        if not lines:
            continue
        first = lines[0].strip()
        if title is None:
            m = re.match(r"#\s+(.+)", first)
            if m:
                title = _plain(m.group(1)) or None
                continue
        if blurb is None and not re.match(r"(#|[-*+]\s|\d+\.\s|\||>|```|<p|<div|<img|!\[|\[!\[)", first):
            text = _plain(block)
            if len(text) >= 40:
                blurb = _clip(text)
    images = []
    for m in [*_MD_IMG.finditer(md), *_HTML_IMG.finditer(md)]:
        src = m.group(2) if m.re is _MD_IMG else m.group(1)
        if not _BADGE.search(src) and src not in images:
            images.append(src)
    # markdown and html images were collected separately; put them back in README order
    images.sort(key=md.find)
    return {"title": title, "blurb": blurb, "images": images}


def _resolve(src: str, user: str, name: str) -> str:
    if src.startswith(("http://", "https://")):
        m = re.match(r"https://github\.com/([^/]+)/([^/]+)/(?:blob|raw)/([^/]+)/(.+)", src)
        if m:  # a github "blob" page -> the raw file
            return f"https://raw.githubusercontent.com/{m[1]}/{m[2]}/{m[3]}/{m[4]}"
        return src
    return urllib.parse.urljoin(RAW.format(user=user, name=name), src[1:] if src.startswith("/") else src)


def save_pictures(urls: list[str], out_dir: Path, user: str) -> tuple[list[str], str]:
    """Download up to three README pictures as webp. Returns (paths relative to static/, layout).

    layout is "screens" when the pictures are phone screenshots (taller than wide),
    otherwise "cover" with just the first good picture.
    """
    try:
        from PIL import Image
    except ImportError:  # still works without Pillow, just keeps the original files
        Image = None

    shots: list[tuple[bytes, str, tuple[int, int] | None]] = []
    for url in urls:
        if len(shots) >= 6:
            break
        try:
            raw = _get(url, user)
        except Exception:
            continue
        if len(raw) > MAX_IMAGE_BYTES:
            continue
        size = None
        if Image:
            try:
                with Image.open(io.BytesIO(raw)) as im:
                    size = im.size
            except Exception:
                continue
            if min(size) < 160:  # icons and avatars, not screenshots
                continue
        ext = Path(urllib.parse.urlparse(url).path).suffix.lower() or ".png"
        shots.append((raw, ext, size))
    if not shots:
        return [], ""

    portrait = [s for s in shots if s[2] and s[2][1] > s[2][0] * 1.3]
    layout, chosen = ("screens", portrait[:3]) if len(portrait) >= 2 else ("cover", shots[:1])

    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)
    paths = []
    for i, (raw, ext, size) in enumerate(chosen, 1):
        if Image:
            target = out_dir / f"{i}.webp"
            with Image.open(io.BytesIO(raw)) as im:
                im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
                limit = 585 if layout == "screens" else 1400
                if im.width > limit:
                    im = im.resize((limit, round(im.height * limit / im.width)), Image.LANCZOS)
                im.save(target, "WEBP", quality=82, method=6)
        else:
            target = out_dir / f"{i}{ext}"
            target.write_bytes(raw)
        paths.append(f"img/auto/{out_dir.name}/{target.name}")
    return paths, layout


# ───────────── repo → project card ─────────────

def _is_game(repo: dict, text: str) -> bool:
    words = " ".join([repo["name"], repo.get("description") or "", " ".join(repo.get("topics") or []), text]).lower()
    return bool(re.search(r"\bgames?\b|roblox|phaser|godot|unity", words))


def _title(name: str) -> str:
    spaced = re.sub(r"(?<=[a-z0-9])(?=[A-Z])|[-_]+", " ", name)
    return spaced[:1].upper() + spaced[1:]


def project_card(repo: dict, user: str, *, img_root: Path = IMG_DIR, fetch_readme=None) -> dict:
    name = repo["name"]
    try:
        md = (fetch_readme or (lambda: _get(RAW.format(user=user, name=name) + "README.md", user).decode("utf-8", "replace")))()
    except Exception:
        md = ""
    info = parse_readme(md)
    lang = repo.get("language")
    langs = [x for x in (repo.get("languages") or ([lang] if lang else [])) if x not in derive._NOISE_LANGS]
    stack = list(dict.fromkeys([*langs[:3], *(t.replace("-", " ").title() for t in (repo.get("topics") or [])[:3])]))
    created = repo.get("created_at") or ""
    card = {
        "id": f"auto-{name.lower()}",
        "title": info["title"] or _title(name),
        "kind": f"{'game' if _is_game(repo, ' '.join(filter(None, [info['title'], info['blurb']]))) else 'project'} · {(lang or 'code').lower()}",
        "year": created[:4] or str(datetime.now(timezone.utc).year),
        "repo": repo.get("html_url") or f"https://github.com/{user}/{name}",
        "tint": derive.LANG_COLORS.get(lang) if lang in ("TypeScript", "Python", "Luau") else TINTS[sum(map(ord, name)) % len(TINTS)],
        "stack": stack or ["code"],
        "blurb": info["blurb"] or repo.get("description") or "fresh off the keyboard. the write-up is coming.",
        "badge": "new",
        "auto": True,
        "created_at": created,
    }
    if repo.get("homepage"):
        card["homepage"] = repo["homepage"]
    pictures, layout = save_pictures([_resolve(s, user, name) for s in info["images"]], img_root / name.lower(), user)
    if layout == "screens":
        card.update(screens=pictures, visual="screens")
    elif pictures:
        card.update(image=pictures[0], image_fit="cover", visual="image")
    else:
        card["visual"] = "code"
    return card


def candidates(repos: list[dict], profile: dict) -> list[dict]:
    known = derive.known_repos(profile)
    since = profile.get("auto_since", "")
    return [
        r for r in repos
        if not r.get("fork") and r["name"].lower() not in known and (r.get("created_at") or "") >= since
    ]


# ───────────── main ─────────────

def _write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sync(*, fetch=github._fetch_live, languages=github.fetch_languages, readme=None, now=None) -> dict:
    profile = json.loads(PROFILE.read_text(encoding="utf-8"))
    user = profile["github_user"]
    repos = fetch(user)
    old = {}
    if SNAPSHOT.exists():
        old = {r["name"]: r for r in json.loads(SNAPSHOT.read_text(encoding="utf-8"))["repos"]}
    for r in repos:
        try:
            r["languages"] = languages(user, r["name"])
        except Exception:
            r["languages"] = old.get(r["name"], {}).get("languages", [])

    stamp = (now or datetime.now(timezone.utc)).isoformat(timespec="seconds")
    if [old.get(r["name"]) for r in repos] != repos or len(old) != len(repos):
        _write_json(SNAPSHOT, {"captured_at": stamp, "repos": repos})

    previous = {}
    if AUTO.exists():
        previous = {p["id"]: p for p in json.loads(AUTO.read_text(encoding="utf-8")).get("projects", [])}
    cards = []
    for repo in sorted(candidates(repos, profile), key=lambda r: r.get("created_at") or "", reverse=True):
        card_id = f"auto-{repo['name'].lower()}"
        kept = previous.get(card_id)
        pics = (kept or {}).get("screens") or ([kept["image"]] if kept and kept.get("image") else [])
        if kept and kept.get("pushed_at") == repo.get("pushed_at") and all((ROOT / "static" / x).exists() for x in pics):
            cards.append(kept)  # nothing new in that repo since last time
            continue
        card = project_card(repo, user, fetch_readme=(lambda r=repo: readme(user, r["name"])) if readme else None)
        card["pushed_at"] = repo.get("pushed_at")
        cards.append(card)

    # pictures of repos that no longer get a card (written up by hand, hidden or deleted)
    if IMG_DIR.exists():
        keep = {c["id"].removeprefix("auto-") for c in cards}
        for d in IMG_DIR.iterdir():
            if d.is_dir() and d.name not in keep:
                shutil.rmtree(d)

    if [c for c in previous.values()] != cards or not AUTO.exists():
        _write_json(AUTO, {"generated_at": stamp, "projects": cards})
    return {"repos": len(repos), "new_projects": [c["title"] for c in cards]}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--preview", metavar="REPO", help="print the card for one repo and change nothing")
    args = ap.parse_args()
    if args.preview:
        import tempfile

        profile = json.loads(PROFILE.read_text(encoding="utf-8"))
        user = profile["github_user"]
        repo = {"name": args.preview, "html_url": f"https://github.com/{user}/{args.preview}"}
        with tempfile.TemporaryDirectory() as tmp:
            card = project_card(repo, user, img_root=Path(tmp))
        print(json.dumps(card, ensure_ascii=False, indent=2))
        return
    print(json.dumps(sync(), ensure_ascii=False))


if __name__ == "__main__":
    main()
