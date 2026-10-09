"""Catalogue des talents (noms lisibles, ordre d'affichage, descriptions).

Source : heroes-talents (MIT). Les identifiants (`id`) sont ceux que contiennent les
replays (ex. « DemonHunterMasteryArsenal » -> « Arsenal »).
"""
from __future__ import annotations

import json
from functools import lru_cache

from app.reference import DATA_DIR

TALENT_LEVELS = (1, 4, 7, 10, 13, 16, 20)


@lru_cache
def catalog() -> dict:
    return json.loads((DATA_DIR / "talents.json").read_text(encoding="utf-8"))["heroes"]


@lru_cache
def _by_id() -> dict[str, dict]:
    out = {}
    for hero_id, hero in catalog().items():
        for level, items in hero["talents"].items():
            for t in items:
                out[t["id"]] = {**t, "level": int(level), "hero_id": hero_id}
    return out


def talent_info(talent_id: str) -> dict | None:
    return _by_id().get(talent_id)


def talent_name(talent_id: str) -> str:
    info = talent_info(talent_id)
    return info["name"] if info else talent_id


def talent_at(hero_id: str, level: int, position: int) -> dict | None:
    """Talent d'un palier par position d'affichage (1 = premier), comme les builds Icy Veins."""
    items = catalog().get(hero_id, {}).get("talents", {}).get(str(level), [])
    for t in items:
        if t["sort"] == position:
            return {**t, "level": level}
    return items[position - 1] if 0 < position <= len(items) else None


def with_names(talents: list[dict]) -> list[dict]:
    """Ajoute le nom lisible aux talents d'une ligne de match."""
    return [{**t, "label": talent_name(t.get("name", ""))} for t in talents or []]
