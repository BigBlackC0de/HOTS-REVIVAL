"""Fabrique de replays synthétiques au format heroprotocol (dicts décodés)."""
from __future__ import annotations

from app.replay.extractor import GAME_START_LOOP
from app.replay.parser import RawReplay

ME_TOON = {"m_region": 2, "m_programId": b"Hero", "m_realm": 1, "m_id": 1278570}
TEAM0 = ["Muradin", "Valla", "Jaina", "Uther", "Sonya"]
TEAM1 = ["E.T.C.", "Raynor", "Kael'thas", "Rehgar", "Thrall"]


def loop(seconds: float) -> int:
    return int(seconds * 16 + GAME_START_LOOP)


def stat_event(name: str, t: float, ints=None, strings=None, fixed=None) -> dict:
    return {
        "_event": "NNet.Replay.Tracker.SStatGameEvent", "_gameloop": loop(t),
        "m_eventName": name.encode(),
        "m_intData": [{"m_key": k.encode(), "m_value": v} for k, v in (ints or [])],
        "m_stringData": [{"m_key": k.encode(), "m_value": v.encode()} for k, v in (strings or [])],
        "m_fixedData": [{"m_key": k.encode(), "m_value": v} for k, v in (fixed or [])],
    }


def make_raw_replay(me_wins: bool = False, duration_s: int = 825, me_deaths: int = 5) -> RawReplay:
    players = []
    for i, hero in enumerate(TEAM0 + TEAM1):
        team = 0 if i < 5 else 1
        toon = ME_TOON if i == 1 else {"m_region": 2, "m_programId": b"Hero", "m_realm": 1, "m_id": 1000 + i}
        won = (team == 0) == me_wins
        players.append({
            "m_name": f"Joueur{i}".encode() if i != 1 else b"Azsra",
            "m_toon": toon, "m_hero": hero.encode(), "m_teamId": team, "m_result": 1 if won else 2,
        })

    base = {
        "SoloKill": [2, 6, 5, 0, 3, 3, 4, 6, 1, 3], "Deaths": [3, me_deaths, 4, 2, 3, 2, 3, 2, 1, 3],
        "Assists": [9, 6, 7, 10, 5, 8, 7, 6, 12, 6], "Takedowns": [11, 12, 12, 10, 8, 11, 11, 12, 13, 9],
        "HeroDamage": [20000, 52000, 48000, 9000, 30000, 18000, 40000, 50000, 8000, 35000],
        "SiegeDamage": [30000, 60000, 45000, 8000, 90000, 25000, 55000, 50000, 9000, 70000],
        "Healing": [0, 0, 0, 55000, 0, 0, 0, 0, 60000, 0],
        "SelfHealing": [8000, 2000, 0, 3000, 15000, 9000, 1000, 0, 5000, 20000],
        "DamageTaken": [70000, 30000, 25000, 28000, 50000, 75000, 28000, 22000, 30000, 52000],
        "ExperienceContribution": [9000, 8500, 8000, 7000, 12000, 9500, 9000, 8800, 7500, 13000],
        "MercCampCaptures": [1, 0, 0, 0, 4, 1, 1, 0, 0, 3],
        "TimeSpentDead": [90, 158, 120, 50, 80, 60, 85, 55, 30, 90],
        "OutnumberedDeaths": [1, 4, 2, 1, 1, 1, 1, 0, 0, 1],
        "TimeCCdEnemyHeroes": [60, 5, 30, 20, 25, 70, 10, 20, 15, 30],
    }
    score_event = {
        "_event": "NNet.Replay.Tracker.SScoreResultEvent", "_gameloop": loop(duration_s),
        "m_instanceList": [
            {"m_name": k.encode(), "m_values": [[{"m_value": v, "m_time": 0}] for v in vals]}
            for k, vals in base.items()
        ],
    }
    events = [
        stat_event("LevelUp", 0, ints=[("PlayerID", 1), ("Level", 1)]),
        stat_event("LevelUp", 410, ints=[("PlayerID", 6), ("Level", 10)]),
        stat_event("LevelUp", 455, ints=[("PlayerID", 2), ("Level", 10)]),
        stat_event("JungleCampCapture", 200, strings=[("CampType", "Siege Camp")], fixed=[("TeamID", 4096)]),
        stat_event("PlayerDeath", 300, ints=[("PlayerID", 2), ("KillingPlayer", 6), ("KillingPlayer", 8)]),
        stat_event("PlayerDeath", 305, ints=[("PlayerID", 3), ("KillingPlayer", 8)]),
        stat_event("PlayerDeath", 309, ints=[("PlayerID", 4), ("KillingPlayer", 7)]),
        stat_event("EndOfGameTalentChoices", duration_s, ints=[("PlayerID", 2), ("Level", 18)],
                   strings=[("Hero", "HeroDemonHunter"), ("Tier 1 Choice", "DemonHunterHotPursuit"),
                            ("Tier 2 Choice", "DemonHunterArsenal")]),
        score_event,
    ]
    return RawReplay(
        header={"m_version": {"m_major": 2, "m_minor": 55, "m_revision": 4, "m_build": 91756, "m_baseBuild": 91756},
                "m_elapsedGameLoops": loop(duration_s)},
        details={"m_title": "Tours du Destin".encode(), "m_playerList": players,
                 "m_timeUTC": 133_700_000_000_000_000},
        initdata={"m_syncLobbyState": {"m_gameDescription": {"m_gameOptions": {"m_ammId": 50091}}}},
        tracker_events=events,
    )
