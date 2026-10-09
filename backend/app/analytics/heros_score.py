"""HEROS SCORE – note propriétaire sur 100, calculée uniquement à partir du replay.

Chaque catégorie est la moyenne de composantes normalisées 0–100 :
une composante vaut 0 au seuil « faible » et 100 au seuil « excellent »
(seuils par rôle, issus de valeurs de référence v1 à recalibrer sur données).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Protocol

ALGO_VERSION = "1.0"
CATEGORIES = ("placement", "macro", "teamfight", "objectives", "survival", "draft")


class PlayerLike(Protocol):
    team: int
    role: str | None
    stats: dict


@dataclass
class HerosScoreResult:
    placement: int
    macro: int
    teamfight: int
    objectives: int
    survival: int
    draft: int
    overall: int
    details: dict[str, dict[str, float]] = field(default_factory=dict)
    algo_version: str = ALGO_VERSION

    def as_dict(self) -> dict[str, int]:
        return {c: getattr(self, c) for c in (*CATEGORIES, "overall")}


# seuils (faible, excellent) par rôle
_DAMAGE_SHARE = {
    "Ranged Assassin": (0.15, 0.30), "Melee Assassin": (0.12, 0.26), "Bruiser": (0.10, 0.22),
    "Tank": (0.07, 0.16), "Healer": (0.02, 0.08), "Support": (0.05, 0.14),
}
_SIEGE_SHARE = {
    "Ranged Assassin": (0.12, 0.28), "Bruiser": (0.12, 0.30), "Support": (0.10, 0.28),
    "Melee Assassin": (0.08, 0.20), "Tank": (0.05, 0.15), "Healer": (0.02, 0.10),
}
_DEATHS_PER_10 = {"Tank": (5.5, 2.0), "Bruiser": (5.0, 1.8)}  # défaut (4.5, 1.5)
_CAMPS_PER_10 = {"Bruiser": (0.0, 3.0), "Support": (0.0, 3.0)}  # défaut (0.0, 2.0)

# poids de la note globale par rôle (draft inclus)
_WEIGHTS = {
    "Tank": {"placement": 0.25, "macro": 0.10, "teamfight": 0.25, "objectives": 0.15, "survival": 0.15, "draft": 0.10},
    "Bruiser": {"placement": 0.15, "macro": 0.25, "teamfight": 0.20, "objectives": 0.15, "survival": 0.15, "draft": 0.10},
    "Healer": {"placement": 0.25, "macro": 0.05, "teamfight": 0.30, "objectives": 0.10, "survival": 0.20, "draft": 0.10},
    "Support": {"placement": 0.15, "macro": 0.25, "teamfight": 0.20, "objectives": 0.15, "survival": 0.15, "draft": 0.10},
}
_DEFAULT_WEIGHTS = {"placement": 0.20, "macro": 0.15, "teamfight": 0.25, "objectives": 0.10, "survival": 0.20, "draft": 0.10}


def scale(value: float, poor: float, good: float) -> float:
    """Normalise linéairement : poor -> 0, good -> 100 (gère poor > good)."""
    if good == poor:
        return 50.0
    x = (value - poor) / (good - poor)
    return round(100 * min(1.0, max(0.0, x)), 1)


def _share(value: float, total: float) -> float:
    return value / total if total > 0 else 0.0


def _mean(components: dict[str, float]) -> int:
    return round(sum(components.values()) / len(components)) if components else 50


def compute_heros_score(
    player: PlayerLike,
    team: Iterable[PlayerLike],
    duration_s: int,
    draft_score: int | None = None,
) -> HerosScoreResult:
    role = player.role or "Ranged Assassin"
    s = player.stats
    team = list(team)
    minutes = max(duration_s / 60, 1.0)
    per10 = 10 / minutes

    def team_total(key: str) -> float:
        return float(sum(int(p.stats.get(key, 0)) for p in team))

    deaths = int(s.get("deaths", 0))
    team_kills = sum(int(p.stats.get("kills", 0)) for p in team)

    # --- Survie
    d_poor, d_good = _DEATHS_PER_10.get(role, (4.5, 1.5))
    survival_c = {
        "deaths_per_10min": scale(deaths * per10, d_poor, d_good),
        "time_dead_pct": scale(_share(s.get("time_spent_dead_s", 0), duration_s), 0.20, 0.04),
    }
    if "EscapesPerformed" in s:
        survival_c["escapes"] = scale(int(s["EscapesPerformed"]) * per10, 0, 2)

    # --- Placement (proxies : morts en infériorité numérique, dégâts encaissés adaptés au rôle)
    placement_c: dict[str, float] = {}
    if "OutnumberedDeaths" in s:
        ratio = _share(int(s["OutnumberedDeaths"]), deaths) if deaths else 0.0
        placement_c["outnumbered_deaths"] = scale(ratio, 0.7, 0.15)
    taken_share = _share(s.get("damage_taken", 0), team_total("damage_taken"))
    if role in ("Tank", "Bruiser"):
        placement_c["frontline_soak"] = scale(taken_share, 0.15, 0.35)
    else:
        placement_c["damage_taken_share"] = scale(taken_share, 0.30, 0.12)
    placement_c["deaths_per_10min"] = survival_c["deaths_per_10min"]

    # --- Teamfight
    kp = _share(int(s.get("takedowns", 0)), team_kills)
    teamfight_c = {"kill_participation": scale(kp, 0.35, 0.80)}
    if role == "Healer":
        teamfight_c["healing_share"] = scale(_share(s.get("healing", 0), team_total("healing")), 0.40, 0.75)
    else:
        lo, hi = _DAMAGE_SHARE.get(role, (0.12, 0.26))
        teamfight_c["hero_damage_share"] = scale(_share(s.get("hero_damage", 0), team_total("hero_damage")), lo, hi)
    if role in ("Tank", "Bruiser", "Support") and "TimeCCdEnemyHeroes" in s:
        teamfight_c["cc_time_per_min"] = scale(int(s["TimeCCdEnemyHeroes"]) / minutes, 1.0, 6.0)

    # --- Macro
    lo, hi = _SIEGE_SHARE.get(role, (0.10, 0.25))
    c_poor, c_good = _CAMPS_PER_10.get(role, (0.0, 2.0))
    macro_c = {
        "xp_share": scale(_share(s.get("xp_contribution", 0), team_total("xp_contribution")), 0.14, 0.28),
        "siege_share": scale(_share(s.get("siege_damage", 0), team_total("siege_damage")), lo, hi),
        "camps_per_10min": scale(int(s.get("merc_camp_captures", 0)) * per10, c_poor, c_good),
    }

    # --- Objectifs
    objectives_c = {"camps_per_10min": macro_c["camps_per_10min"]}
    if "StructureDamage" in s:
        objectives_c["structure_damage_share"] = scale(
            _share(int(s["StructureDamage"]), team_total("StructureDamage")), 0.08, 0.25
        )
    if "WatchTowerCaptures" in s:
        objectives_c["watchtowers"] = scale(int(s["WatchTowerCaptures"]) * per10, 0, 2)
    objectives_c["presence"] = scale(1 - _share(s.get("time_spent_dead_s", 0), duration_s), 0.80, 0.97)

    categories = {
        "placement": _mean(placement_c),
        "macro": _mean(macro_c),
        "teamfight": _mean(teamfight_c),
        "objectives": _mean(objectives_c),
        "survival": _mean(survival_c),
        "draft": int(draft_score) if draft_score is not None else 50,
    }
    weights = _WEIGHTS.get(role, _DEFAULT_WEIGHTS)
    overall = round(sum(categories[c] * w for c, w in weights.items()))

    return HerosScoreResult(
        **categories,
        overall=overall,
        details={
            "placement": placement_c, "macro": macro_c, "teamfight": teamfight_c,
            "objectives": objectives_c, "survival": survival_c, "weights": weights,
        },
    )
