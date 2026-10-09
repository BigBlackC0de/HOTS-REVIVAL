"""« Vrais » timers de carte, mesurés sur les replays importés du joueur.

Chaque replay contient l'horloge exacte des évènements de carte (noms vérifiés sur
replays réels). On en déduit, par carte, l'heure médiane du premier objectif et le
délai médian entre deux objectifs, qui remplacent les valeurs par défaut de maps.json.
"""
from __future__ import annotations

from collections import defaultdict
from statistics import median

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Match, MatchEvent
from app.reference import registry

MIN_SAMPLES = 3

# Évènements marquant le DÉBUT d'un objectif (ou, à défaut, sa fin) par carte.
# Les noms en commentaire « vérifié » ont été observés dans des replays réels.
OBJECTIVE_START_EVENTS: dict[str, tuple[str, ...]] = {
    "battlefield_of_eternity": ("Boss Duel Started",),  # vérifié
    "warhead_junction": ("WarheadJunctionNukesSpawned",),  # vérifié
    "sky_temple": ("SkyTempleActivated",),
    "infernal_shrines": ("Infernal Shrine Activated",),
}
OBJECTIVE_END_EVENTS: dict[str, tuple[str, ...]] = {
    "battlefield_of_eternity": ("Immortal Defeated",),  # vérifié
    "dragon_shire": ("DragonKnightActivated",),  # vérifié
    "braxis_holdout": ("BraxisHoldoutMapEventComplete",),  # vérifié
    "volskaya_foundry": ("VolskayaCapturePointComplete",),  # vérifié
    "blackhearts_bay": ("GhostShipCaptured",),  # vérifié
    "towers_of_doom": ("Altar Captured", "AltarCaptured"),
    "infernal_shrines": ("Infernal Shrine Captured", "Punisher Killed"),
    "cursed_hollow": ("TributeCollected", "Tribute Collected", "RavenCurseActivated"),
    "sky_temple": ("SkyTempleCaptured",),
    "garden_of_terror": ("GardenTerrorActivated", "Garden Terror Activated"),
    "tomb_of_the_spider_queen": ("SpiderQueenSpawned", "Webweavers Spawned"),
}


def _events_by_match(db: Session, map_id: str) -> dict[int, list[tuple[float, str]]]:
    rows = db.execute(
        select(MatchEvent.match_id, MatchEvent.t_s, MatchEvent.payload)
        .join(Match)
        .where(Match.map_id == map_id, MatchEvent.kind == "objective")
        .order_by(MatchEvent.match_id, MatchEvent.t_s)
    )
    out: dict[int, list[tuple[float, str]]] = defaultdict(list)
    for match_id, t_s, payload in rows:
        out[match_id].append((t_s, (payload or {}).get("name", "")))
    return out


def calibrate_map(db: Session, map_id: str) -> dict | None:
    """Timer calibré d'une carte, ou None si moins de MIN_SAMPLES parties exploitables."""
    matches = _events_by_match(db, map_id)
    starts = OBJECTIVE_START_EVENTS.get(map_id, ())
    ends = OBJECTIVE_END_EVENTS.get(map_id, ())

    firsts: list[float] = []
    intervals: list[float] = []
    for events in matches.values():
        start_times = [t for t, n in events if n in starts]
        end_times = [t for t, n in events if n in ends]
        if start_times:
            firsts.append(start_times[0])
            # délai entre la fin d'un objectif et le début du suivant
            for end in end_times:
                nxt = next((s for s in start_times if s > end), None)
                if nxt is not None:
                    intervals.append(nxt - end)
            if not end_times:
                intervals += [b - a for a, b in zip(start_times, start_times[1:])]
        elif end_times:
            intervals += [b - a for a, b in zip(end_times, end_times[1:])]
    if len(matches) < MIN_SAMPLES or not (firsts or intervals):
        return None
    return {
        "first_objective_s": round(median(firsts)) if len(firsts) >= MIN_SAMPLES else None,
        "objective_interval_s": round(median(intervals)) if len(intervals) >= MIN_SAMPLES else None,
        "samples": len(matches),
    }


def map_timings(db: Session | None, map_id: str) -> dict:
    """Timers à utiliser pour l'overlay : calibrés si possible, sinon valeurs de référence."""
    info = registry().maps.get(map_id)
    base = {
        "first_objective_s": info.first_objective_s if info else None,
        "objective_interval_s": info.objective_interval_s if info else None,
        "source": "mesuré" if info and info.verified else "estimation",
        "samples": 0,
    }
    if db is None or info is None:
        return base
    calibrated = calibrate_map(db, map_id)
    if calibrated:
        for key in ("first_objective_s", "objective_interval_s"):
            if calibrated[key]:
                base[key] = calibrated[key]
        base["source"] = "vos replays"
        base["samples"] = calibrated["samples"]
    return base
