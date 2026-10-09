"""Remplit la base avec des parties synthétiques (démo / développement UI).

Usage : python scripts/seed_demo.py [nombre]   (utilise HOTS_DATABASE_URL)
"""
from __future__ import annotations

import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.db import SessionLocal, create_schema, init_engine  # noqa: E402
from app.models import Replay  # noqa: E402
from app.reference import registry  # noqa: E402
from app.replay.extractor import ParsedEvent, ParsedMatch, ParsedPlayer  # noqa: E402
from app.replay.importer import persist_match  # noqa: E402

ME_TOON = "2-Hero-1-1278570"
MY_POOL = ["valla", "jaina", "muradin", "uther", "cassia", "sonya", "lucio", "raynor"]
TALENTS = {"valla": [["DemonHunterHotPursuit", "DemonHunterManticore"], ["DemonHunterArsenal", "DemonHunterCaltrops"],
                     ["DemonHunterRepeatingArrow", "DemonHunterSiphoningArrow"], ["DemonHunterStrafe", "DemonHunterRainOfVengeance"]]}


def fake_match(rng: random.Random, i: int) -> ParsedMatch:
    reg = registry()
    heroes = list(reg.heroes.values())
    my_hero = reg.heroes[rng.choice(MY_POOL)]
    picks = [my_hero] + rng.sample([h for h in heroes if h.id != my_hero.id], 9)
    duration = rng.randint(780, 1500)
    winner = rng.choice([0, 1])
    players = []
    for slot, hero in enumerate(picks):
        team = 0 if slot < 5 else 1
        minutes = duration / 60
        deaths = rng.randint(0, 7)
        kills = rng.randint(0, 9)
        stats = {
            "kills": kills, "deaths": deaths, "assists": rng.randint(3, 15), "takedowns": kills + rng.randint(3, 12),
            "hero_damage": int(rng.uniform(1500, 4500) * minutes) if "Assassin" in hero.role else int(rng.uniform(600, 2200) * minutes),
            "siege_damage": int(rng.uniform(1500, 5000) * minutes),
            "healing": int(rng.uniform(3000, 5000) * minutes) if hero.role == "Healer" else 0,
            "self_healing": int(rng.uniform(0, 800) * minutes), "damage_taken": int(rng.uniform(1000, 4500) * minutes),
            "xp_contribution": int(rng.uniform(450, 900) * minutes), "merc_camp_captures": rng.randint(0, 5),
            "time_spent_dead_s": deaths * rng.randint(20, 45), "OutnumberedDeaths": rng.randint(0, deaths),
            "TimeCCdEnemyHeroes": rng.randint(5, 90), "EscapesPerformed": rng.randint(0, 4),
        }
        talents = []
        generic = [[f"{hero.name} – talent {t}{o}" for o in "ABC"] for t in range(1, 8)]
        for tier, opts in enumerate(TALENTS.get(hero.id, generic), start=1):
            talents.append({"tier": tier, "level": (1, 4, 7, 10, 13, 16, 20)[tier - 1], "name": rng.choice(opts)})
        players.append(ParsedPlayer(
            slot=slot, team=team, name="Azsra" if slot == 0 else f"Joueur{slot}",
            toon_handle=ME_TOON if slot == 0 else f"2-Hero-1-{100000 + i * 10 + slot}", hero_raw=hero.name,
            hero_id=hero.id, hero_name=hero.name, role=hero.role, is_winner=team == winner, stats=stats, talents=talents,
        ))
    events = [ParsedEvent(rng.uniform(60, duration), "death", p.team, p.slot, {"killers": []})
              for p in players for _ in range(p.stats["deaths"])]
    for team in (0, 1):
        for lvl, t in ((10, rng.randint(380, 520)), (16, rng.randint(720, 900)), (20, rng.randint(1050, 1300))):
            if t < duration:
                events.append(ParsedEvent(t, "level", team, None, {"level": lvl}))
    events.sort(key=lambda e: e.t_s)
    m = rng.choice(list(reg.maps.values()))
    return ParsedMatch(
        map_raw=m.name, map_id=m.id, map_name=m.name, game_mode="Storm League", game_version="2.55.4.91756",
        played_at=datetime.now(timezone.utc) - timedelta(hours=6 * (40 - i)), duration_s=duration,
        winner_team=winner, players=players, events=events, team_levels={0: 20, 1: 19},
    )


def main(n: int = 30) -> None:
    init_engine(get_settings().resolved_database_url())
    create_schema()
    rng = random.Random(42)
    with SessionLocal() as db:
        for i in range(n):
            replay = Replay(file_path=f"demo-{i}.StormReplay", file_hash=f"demo-{i:04d}".ljust(64, "0"), status="parsed")
            db.add(replay)
            db.flush()
            persist_match(db, replay, fake_match(rng, i), ME_TOON)
        db.commit()
    print(f"{n} parties de démonstration créées.")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 30)
