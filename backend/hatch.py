"""Server-side egg hatching. Like in Roll Pets RNG, the server rolls first
and the client only animates the result it gets back."""

from __future__ import annotations

import secrets

_rng = secrets.SystemRandom()

# Rarest first. `odds` = 1 in N. Commons share whatever probability is left.
PETS = [
    {"id": "dev", "name": "zzqxck", "rarity": "secret", "odds": 1_000_000},
    {"id": "dragon", "name": "Dragon", "rarity": "mythical", "odds": 1_000},
    {"id": "axolotl", "name": "Axolotl", "rarity": "legendary", "odds": 250},
    {"id": "penguin", "name": "Penguin", "rarity": "epic", "odds": 60},
    {"id": "fox", "name": "Fox", "rarity": "rare", "odds": 15},
    {"id": "bunny", "name": "Bunny", "rarity": "uncommon", "odds": 5},
]
COMMONS = [
    {"id": "dog", "name": "Doggy", "rarity": "common"},
    {"id": "cat", "name": "Kitty", "rarity": "common"},
]
SIZES = [("titanic", 1_000), ("huge", 100)]  # rarest first, independent of the pet
SHINY_ODDS = 50

_left = 1.0 - sum(1 / p["odds"] for p in PETS)
for _pet in COMMONS:
    _pet["odds"] = len(COMMONS) / _left


def probabilities() -> dict[str, float]:
    return {p["id"]: 1 / p["odds"] for p in PETS + COMMONS}


def format_odds(n: float) -> str:
    """1 in 2.81 / 1 in 12.5K / 1 in 6M, the way the games print it."""
    for limit, suffix in ((1e12, "T"), (1e9, "B"), (1e6, "M"), (1e3, "K")):
        if n >= limit:
            value = n / limit
            text = f"{value:.1f}".rstrip("0").rstrip(".") if value < 100 else f"{value:.0f}"
            return f"1 in {text}{suffix}"
    if n < 10:
        return f"1 in {n:.2f}".rstrip("0").rstrip(".")
    return f"1 in {round(n)}"


def _pick_pet(u: float) -> dict:
    acc = 0.0
    for pet in PETS:
        acc += 1 / pet["odds"]
        if u < acc:
            return pet
    index = min(int((u - acc) / (_left / len(COMMONS))), len(COMMONS) - 1)
    return COMMONS[index]


def _pick_size(u: float) -> tuple[str, int]:
    acc = 0.0
    for size, odds in SIZES:
        acc += 1 / odds
        if u < acc:
            return size, odds
    return "normal", 1


def hatch(rng=_rng) -> dict:
    pet = _pick_pet(rng.random())
    size, size_odds = _pick_size(rng.random())
    shiny = rng.random() < 1 / SHINY_ODDS
    chance = pet["odds"] * size_odds * (SHINY_ODDS if shiny else 1)
    return {
        "pet": {"id": pet["id"], "name": pet["name"], "rarity": pet["rarity"]},
        "size": size,
        "shiny": shiny,
        "chance": chance,
        "chance_label": format_odds(chance),
    }
