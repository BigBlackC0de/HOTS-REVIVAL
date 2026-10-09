"""Transformation pure : RawReplay -> ParsedMatch (testable sans fichier réel)."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.reference import normalize, registry
from app.replay.parser import RawReplay

GAMELOOPS_PER_SECOND = 16
# Boucle à laquelle l'horloge de jeu affiche 0:00 (valeur communément admise
# par les parseurs communautaires ; ajustable si Blizzard la modifie).
GAME_START_LOOP = 610
TALENT_TIERS = (1, 4, 7, 10, 13, 16, 20)

# Identifiants AMM (file d'attente) -> mode. Valeurs best-effort.
GAME_MODES = {
    50001: "Quick Match",
    50021: "Versus AI",
    50031: "Brawl",
    50041: "Practice",
    50051: "Unranked Draft",
    50061: "Hero League",
    50071: "Team League",
    50091: "Storm League",
    50101: "ARAM",
}

SCORE_FIELDS = {
    "SoloKill": "kills",
    "Deaths": "deaths",
    "Assists": "assists",
    "Takedowns": "takedowns",
    "HeroDamage": "hero_damage",
    "SiegeDamage": "siege_damage",
    "Healing": "healing",
    "SelfHealing": "self_healing",
    "DamageTaken": "damage_taken",
    "ExperienceContribution": "xp_contribution",
    "MercCampCaptures": "merc_camp_captures",
    "TimeSpentDead": "time_spent_dead_s",
}

# Évènements de stat reconnus comme « objectifs de carte » (liste extensible).
OBJECTIVE_EVENTS = {
    "AltarCaptured", "TownStructureDeath", "DragonKnightActivated", "ImmortalDefeated",
    "TributeCollected", "CurseActivated", "GardenTerrorActivated", "SkyTempleCaptured",
    "SkyTempleShotsFired", "SpiderQueenSpawned", "SoulEatersSpawned", "Infernal Shrine Captured",
    "Punisher Killed", "BraxisHoldoutMapEventComplete", "GhostShipCaptured", "NukeLaunched",
    "PayloadReachedDestination", "TriglavProtectorSpawned", "GatesOpen",
}


@dataclass
class ParsedPlayer:
    slot: int
    team: int
    name: str
    toon_handle: str | None
    hero_raw: str
    hero_id: str
    hero_name: str
    role: str | None
    is_winner: bool
    stats: dict[str, int] = field(default_factory=dict)
    talents: list[dict[str, Any]] = field(default_factory=list)

    def stat(self, field_name: str) -> int:
        return int(self.stats.get(field_name, 0))


@dataclass
class ParsedEvent:
    t_s: float
    kind: str
    team: int | None = None
    slot: int | None = None
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass
class ParsedMatch:
    map_raw: str
    map_id: str
    map_name: str
    game_mode: str | None
    game_version: str
    played_at: datetime | None
    duration_s: int
    winner_team: int | None
    players: list[ParsedPlayer]
    events: list[ParsedEvent]
    team_levels: dict[int, int]


def _s(value: Any) -> str:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return "" if value is None else str(value)


def loop_to_seconds(gameloop: int) -> float:
    return max(0.0, (gameloop - GAME_START_LOOP) / GAMELOOPS_PER_SECOND)


def _filetime_to_datetime(filetime: int | None) -> datetime | None:
    if not filetime:
        return None
    unix = (filetime - 116_444_736_000_000_000) / 10_000_000
    try:
        return datetime.fromtimestamp(unix, tz=timezone.utc)
    except (OverflowError, OSError, ValueError):
        return None


def _toon_handle(toon: dict[str, Any] | None) -> str | None:
    if not toon or not toon.get("m_id"):
        return None
    return f"{toon.get('m_region')}-{_s(toon.get('m_programId'))}-{toon.get('m_realm')}-{toon.get('m_id')}"


def _kv(entries: list[dict[str, Any]] | None) -> dict[str, list[Any]]:
    """[{m_key, m_value}, ...] -> {key: [values...]} (une clé peut se répéter)."""
    out: dict[str, list[Any]] = defaultdict(list)
    for e in entries or []:
        out[_s(e.get("m_key"))].append(e.get("m_value"))
    return out


def _game_mode(initdata: dict[str, Any] | None) -> str | None:
    try:
        amm = initdata["m_syncLobbyState"]["m_gameDescription"]["m_gameOptions"]["m_ammId"]  # type: ignore[index]
    except (KeyError, TypeError):
        return None
    if amm is None:
        return "Custom"
    return GAME_MODES.get(int(amm), f"AMM {amm}")


def extract_match(raw: RawReplay) -> ParsedMatch:
    reg = registry()
    details = raw.details
    header = raw.header

    version = header.get("m_version", {})
    game_version = "{}.{}.{}.{}".format(
        version.get("m_major", 0), version.get("m_minor", 0),
        version.get("m_revision", 0), version.get("m_build", 0),
    )
    duration_s = int(loop_to_seconds(int(header.get("m_elapsedGameLoops", 0))))

    map_raw = _s(details.get("m_title"))
    map_info = reg.resolve_map(map_raw)

    players: list[ParsedPlayer] = []
    winner_team: int | None = None
    for slot, p in enumerate(details.get("m_playerList", [])):
        hero_raw = _s(p.get("m_hero"))
        hero = reg.resolve_hero(hero_raw)
        team = int(p.get("m_teamId", 0))
        is_winner = p.get("m_result") == 1
        if is_winner:
            winner_team = team
        players.append(
            ParsedPlayer(
                slot=slot,
                team=team,
                name=_s(p.get("m_name")),
                toon_handle=_toon_handle(p.get("m_toon")),
                hero_raw=hero_raw,
                hero_id=hero.id if hero else normalize(hero_raw),
                hero_name=hero.name if hero else hero_raw,
                role=hero.role if hero else None,
                is_winner=is_winner,
            )
        )

    def player_for(player_id: Any) -> ParsedPlayer | None:
        try:
            idx = int(player_id) - 1
        except (TypeError, ValueError):
            return None
        return players[idx] if 0 <= idx < len(players) else None

    events: list[ParsedEvent] = []
    team_levels: dict[int, int] = {0: 1, 1: 1}

    for ev in raw.tracker_events:
        name = ev.get("_event", "")
        t = loop_to_seconds(int(ev.get("_gameloop", 0)))

        if name == "NNet.Replay.Tracker.SScoreResultEvent":
            for inst in ev.get("m_instanceList", []):
                key = _s(inst.get("m_name"))
                for slot, values in enumerate(inst.get("m_values", [])):
                    if slot < len(players) and values:
                        players[slot].stats[key] = int(values[-1].get("m_value", 0))
            continue

        if name != "NNet.Replay.Tracker.SStatGameEvent":
            continue

        stat = _s(ev.get("m_eventName"))
        ints = _kv(ev.get("m_intData"))
        strings = _kv(ev.get("m_stringData"))
        fixed = _kv(ev.get("m_fixedData"))

        if stat == "PlayerDeath":
            victim = player_for((ints.get("PlayerID") or [None])[0])
            if victim:
                killers = [k.slot for k in (player_for(pid) for pid in ints.get("KillingPlayer", [])) if k]
                events.append(ParsedEvent(t, "death", victim.team, victim.slot, {"killers": killers}))
        elif stat == "LevelUp":
            p = player_for((ints.get("PlayerID") or [None])[0])
            level = int((ints.get("Level") or [0])[0])
            if p and level > team_levels.get(p.team, 1):
                team_levels[p.team] = level
                events.append(ParsedEvent(t, "level", p.team, None, {"level": level}))
        elif stat == "JungleCampCapture":
            team_id = (fixed.get("TeamID") or [None])[0]
            team = int(team_id / 4096) - 1 if team_id is not None else None
            camp = _s((strings.get("CampType") or ["?"])[0])
            events.append(ParsedEvent(t, "camp", team, None, {"camp": camp}))
        elif stat == "EndOfGameTalentChoices":
            p = player_for((ints.get("PlayerID") or [None])[0])
            if not p:
                continue
            hero_internal = _s((strings.get("Hero") or [""])[0])
            if p.role is None and hero_internal:
                hero = reg.resolve_hero(hero_internal)
                if hero:
                    p.hero_id, p.hero_name, p.role = hero.id, hero.name, hero.role
            for tier, level in enumerate(TALENT_TIERS, start=1):
                choice = strings.get(f"Tier {tier} Choice")
                if choice:
                    p.talents.append({"tier": tier, "level": level, "name": _s(choice[0])})
        elif stat in OBJECTIVE_EVENTS:
            team_id = (ints.get("Team") or ints.get("TeamID") or [None])[0]
            events.append(
                ParsedEvent(t, "objective", int(team_id) - 1 if team_id else None, None, {"name": stat})
            )

    for p in players:
        for src, dst in SCORE_FIELDS.items():
            if src in p.stats:
                p.stats[dst] = p.stats[src]
        # fallback : morts comptées depuis les évènements si le score est absent
        if "deaths" not in p.stats:
            p.stats["deaths"] = sum(1 for e in events if e.kind == "death" and e.slot == p.slot)

    events.sort(key=lambda e: e.t_s)
    return ParsedMatch(
        map_raw=map_raw,
        map_id=map_info.id if map_info else normalize(map_raw),
        map_name=map_info.name if map_info else map_raw,
        game_mode=_game_mode(raw.initdata),
        game_version=game_version,
        played_at=_filetime_to_datetime(details.get("m_timeUTC")),
        duration_s=duration_s,
        winner_team=winner_team,
        players=players,
        events=events,
        team_levels=team_levels,
    )
