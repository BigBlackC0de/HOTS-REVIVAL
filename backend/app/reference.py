"""Référentiels statiques : héros et cartes (données publiques)."""
from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"

# Mots-clés -> carte (ordre important : « hanamura » avant « temple »).
MAP_KEYWORDS: tuple[tuple[str, str], ...] = (
    ("hanamura", "hanamura_temple"), ("towersofdoom", "towers_of_doom"), ("toursdudestin", "towers_of_doom"),
    ("shrine", "infernal_shrines"), ("sanctuaire", "infernal_shrines"), ("spider", "tomb_of_the_spider_queen"),
    ("araignee", "tomb_of_the_spider_queen"), ("volskaya", "volskaya_foundry"), ("warhead", "warhead_junction"),
    ("ogive", "warhead_junction"), ("braxis", "braxis_holdout"), ("dragon", "dragon_shire"),
    ("cursed", "cursed_hollow"), ("maudit", "cursed_hollow"), ("blackheart", "blackhearts_bay"),
    ("coeurnoir", "blackhearts_bay"), ("eternity", "battlefield_of_eternity"), ("eternite", "battlefield_of_eternity"),
    ("alterac", "alterac_pass"), ("garden", "garden_of_terror"), ("hauntedwoods", "garden_of_terror"),
    ("jardin", "garden_of_terror"), ("skytemple", "sky_temple"), ("luxoria", "sky_temple"),
    ("templeceleste", "sky_temple"),
)

ROLES = ("Tank", "Bruiser", "Ranged Assassin", "Melee Assassin", "Healer", "Support")


def normalize(text: str) -> str:
    """'Tours du Destin' -> 'toursdudestin', 'Lúcio' -> 'lucio'."""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", text.lower())


@dataclass(frozen=True)
class Hero:
    id: str
    name: str
    role: str
    tags: frozenset[str]
    curve: tuple[int, int, int]


@dataclass(frozen=True)
class MapInfo:
    id: str
    name: str
    objective: str
    first_objective_s: int
    objective_interval_s: int
    verified: bool
    tips: tuple[str, ...] = field(default_factory=tuple)


class _Registry:
    def __init__(self) -> None:
        heroes_raw = json.loads((DATA_DIR / "heroes.json").read_text(encoding="utf-8"))
        maps_raw = json.loads((DATA_DIR / "maps.json").read_text(encoding="utf-8"))

        self.heroes: dict[str, Hero] = {}
        self._hero_alias: dict[str, str] = {}
        for h in heroes_raw["heroes"]:
            hero = Hero(h["id"], h["name"], h["role"], frozenset(h["tags"]), tuple(h["curve"]))
            self.heroes[hero.id] = hero
            for alias in [h["id"], h["name"], *h.get("aliases", [])]:
                self._hero_alias[normalize(alias)] = hero.id
                self._hero_alias[normalize("Hero" + alias)] = hero.id

        self.camp_respawn_s: dict[str, int] = maps_raw["_meta"]["camp_respawn_s"]
        self.camps_first_spawn_s: int = maps_raw["_meta"]["camps_first_spawn_s"]
        self.maps: dict[str, MapInfo] = {}
        self._map_alias: dict[str, str] = {}
        for m in maps_raw["maps"]:
            info = MapInfo(
                m["id"], m["name"], m["objective"], m["first_objective_s"],
                m["objective_interval_s"], m["verified"], tuple(m.get("tips", [])),
            )
            self.maps[info.id] = info
            for alias in [m["id"], m["name"], *m.get("aliases", [])]:
                self._map_alias[normalize(alias)] = info.id

    def resolve_hero(self, raw: str) -> Hero | None:
        hero_id = self._hero_alias.get(normalize(raw))
        return self.heroes.get(hero_id) if hero_id else None

    def resolve_map(self, raw: str) -> MapInfo | None:
        map_id = self._map_alias.get(normalize(raw))
        return self.maps.get(map_id) if map_id else None

    def guess_map(self, raw: str) -> MapInfo | None:
        """Résolution tolérante (identifiants internes type « TowersOfDoom », titres partiels)."""
        exact = self.resolve_map(raw)
        if exact:
            return exact
        text = normalize(raw)
        for keyword, map_id in MAP_KEYWORDS:
            if keyword in text:
                return self.maps.get(map_id)
        return None


@lru_cache
def registry() -> _Registry:
    return _Registry()
