"""État de la partie en cours, construit UNIQUEMENT à partir de sources autorisées
(voir compliance.ALLOWED_SOURCES) : processus du jeu présent ou non, fichier de chargement
(carte, joueurs), lecture de l'écran opt-in ou saisies du joueur (horloge, niveaux), camps
observés, timers mesurés sur replays.

Cycle : idle → loading (fichier de chargement) → in_game (horloge connue) → ended
(replay enregistré) → idle. Chaque nouvelle partie repart d'un état vierge.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any

from app.live.composition import teams_from
from app.reference import registry

TALENT_LEVELS = (1, 4, 7, 10, 13, 16, 20)
OBJECTIVE_WARNING_S = 45
FLASH_DURATION_S = 8
MAX_ALERTS = 3
ENDED_LINGER_S = 15
LEVEL_SOURCES = ("manuel", "écran")


def talent_tier(level: int) -> int:
    return sum(1 for lvl in TALENT_LEVELS if level >= lvl)


@dataclass
class CampTimer:
    camp_type: str
    side: str  # "ally" | "enemy"
    respawn_at: float  # horloge de jeu (s)


@dataclass
class LiveSession:
    status: str = "idle"
    game_id: int = 0
    game_running: bool = False  # processus HeroesOfTheStorm détecté
    map_id: str | None = None
    map_source: str | None = None
    my_hero_id: str | None = None
    lobby_players: list[str] = field(default_factory=list)
    lobby_map_hash: str | None = None
    clock_anchor: float | None = None  # time.monotonic() correspondant à 0:00
    clock_source: str | None = None
    timings: dict = field(default_factory=dict)
    next_objective_at: float | None = None
    ally_level: int = 1
    enemy_level: int = 1
    level_source: str | None = None  # None = inconnu (rien d'affiché) | manuel | écran
    composition: dict[str, dict] = field(default_factory=dict)
    camps: list[CampTimer] = field(default_factory=list)
    talent_build: list[dict] = field(default_factory=list)
    ended_at: float | None = None
    loading_since: float | None = None
    _flashes: dict[str, tuple[str, str, float]] = field(default_factory=dict)
    _flashed: set[str] = field(default_factory=set)
    _lock: threading.RLock = field(default_factory=threading.RLock, repr=False)

    # ---- cycle de vie ------------------------------------------------------------------
    def _new_game_locked(self) -> None:
        running = self.game_running
        game_id = self.game_id + 1
        fresh = LiveSession()
        for name in fresh.__dataclass_fields__:
            if name != "_lock":
                setattr(self, name, getattr(fresh, name))
        self.game_running, self.game_id = running, game_id

    def on_lobby(self, battletags: list[str], map_id: str | None, map_source: str | None,
                 map_hash: str | None, timings: dict | None = None, age_s: float = 0.0) -> None:
        """Nouveau fichier de chargement = nouvelle partie : on repart de zéro."""
        with self._lock:
            self._new_game_locked()
            self.status = "loading"
            self.loading_since = time.monotonic() - age_s
            self.lobby_players, self.lobby_map_hash = battletags, map_hash
            self.map_id, self.map_source = map_id, map_source
            self.timings = timings or {}

    def start(self, map_id: str | None, my_hero_id: str | None, clock_s: float = 0.0,
              timings: dict | None = None) -> None:
        with self._lock:
            if self.status in ("idle", "ended"):
                self._new_game_locked()
            if map_id and map_id != self.map_id:
                self.map_id, self.map_source = map_id, "manuel"
                self.timings = timings or {}
            elif timings and not self.timings:
                self.timings = timings
            self.my_hero_id = my_hero_id or self.my_hero_id
            self._set_clock_locked(clock_s, "manuel")

    def _set_clock_locked(self, clock_s: float, source: str) -> None:
        first_sync = self.clock_anchor is None
        self.clock_anchor = time.monotonic() - clock_s
        self.clock_source = source
        self.status = "in_game"
        if first_sync or self.next_objective_at is None:
            first = self.timings.get("first_objective_s")
            if first:
                self.next_objective_at = float(first)
                interval = self.timings.get("objective_interval_s") or 0
                while interval and self.next_objective_at < clock_s - 60:
                    self.next_objective_at += interval

    def sync_clock(self, clock_s: float, source: str = "manuel") -> None:
        with self._lock:
            if self.status in ("idle", "ended"):
                self._new_game_locked()
            # une lecture d'écran ne corrige une horloge déjà lue que si l'écart est notable
            current = self.clock()
            if (source == "écran" and self.clock_source == "écran" and current is not None
                    and abs(current - clock_s) < 2):
                return
            self._set_clock_locked(clock_s, source)

    def estimated_level(self) -> int:
        clock = self.clock() if self.status == "in_game" else None
        if clock is None:
            return 1
        curve = self.timings.get("level_curve") or {}
        level = 1
        for lvl, t in sorted((int(k), v) for k, v in curve.items()):
            if clock >= t:
                level = lvl
        return level

    def effective_levels(self) -> tuple[int, int]:
        return self.ally_level, self.enemy_level

    def plausible_level(self, level: int) -> bool:
        """Une première lecture d'écran doit rester proche de la courbe d'XP (anti-erreur d'OCR)."""
        if not self.timings.get("level_curve"):
            return True
        if self.clock_source is None or self.clock() is None:
            return False  # horloge pas encore lue : l'écran renverra la valeur une fois calé

        return abs(level - self.estimated_level()) <= 5

    def set_levels(self, ally: int | None, enemy: int | None, source: str = "manuel") -> None:
        with self._lock:
            if source == "écran" and self.level_source != "écran":
                if ally is not None and not self.plausible_level(ally):
                    ally = None
                if enemy is not None and not self.plausible_level(enemy):
                    enemy = None
                if ally is None and enemy is None:
                    return
            if self.level_source is None:
                # première vraie valeur : c'est la référence, rien à annoncer
                self.ally_level = max(1, min(30, ally)) if ally is not None else self.ally_level
                self.enemy_level = max(1, min(30, enemy)) if enemy is not None else self.enemy_level
            if ally is not None:
                ally = max(1, min(30, ally))
                crossed = [lvl for lvl in TALENT_LEVELS[1:] if self.ally_level < lvl <= ally]
                if crossed:  # un seul message, même si plusieurs paliers d'un coup
                    self._flash_locked(f"ally-{crossed[-1]}", f"Niveau {crossed[-1]} atteint.", "success")
                self.ally_level = ally
            if enemy is not None:
                enemy = max(1, min(30, enemy))
                crossed = [lvl for lvl in (10, 16, 20) if self.enemy_level < lvl <= enemy]
                if crossed:
                    self._flash_locked(f"enemy-{crossed[-1]}", f"L'équipe adverse atteint le niveau {crossed[-1]}.", "danger")
                self.enemy_level = enemy
            self.level_source = source if source in LEVEL_SOURCES else "manuel"

    def add_composition(self, entries: dict[str, dict]) -> None:
        """Héros lus sur l'écran de chargement (cumulés d'une lecture à l'autre)."""
        with self._lock:
            for key, entry in entries.items():
                self.composition.setdefault(key, entry)

    def objective_done(self) -> None:
        with self._lock:
            now = self.clock()
            interval = self.timings.get("objective_interval_s")
            if interval and now is not None:
                self.next_objective_at = now + interval

    def camp_taken(self, camp_type: str, side: str) -> None:
        with self._lock:
            now = self.clock() or 0.0
            respawn = registry().camp_respawn_s.get(camp_type, registry().camp_respawn_s["other"])
            self.camps = [c for c in self.camps if not (c.camp_type == camp_type and c.side == side)]
            self.camps.append(CampTimer(camp_type, side, now + respawn))

    def on_game_end(self) -> None:
        """Replay enregistré : la partie est finie, l'overlay se vide."""
        with self._lock:
            if self.status != "idle":
                self.status, self.ended_at = "ended", time.monotonic()

    def on_process(self, running: bool) -> None:
        with self._lock:
            was = self.game_running
            self.game_running = running
            if was and not running:  # jeu fermé : plus rien à afficher
                self._new_game_locked()

    def stop(self) -> None:
        with self._lock:
            self._new_game_locked()

    # ---- lecture -----------------------------------------------------------------------
    def clock(self) -> float | None:
        return None if self.clock_anchor is None else max(0.0, time.monotonic() - self.clock_anchor)

    def _flash_locked(self, key: str, text: str, level: str) -> None:
        if key not in self._flashed:
            self._flashed.add(key)
            self._flashes[key] = (text, level, time.monotonic() + FLASH_DURATION_S)

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            now = time.monotonic()
            if self.status == "ended" and self.ended_at and now - self.ended_at > ENDED_LINGER_S:
                self._new_game_locked()
            return compute_overlay(self)


def _upcoming(s: LiveSession, clock: float | None, count: int = 3) -> list[float]:
    """Heures d'horloge projetées des prochains objectifs (estimation)."""
    if clock is None or s.next_objective_at is None:
        return []
    interval = s.timings.get("objective_interval_s") or 0
    out, t = [], s.next_objective_at
    while len(out) < count and interval:
        if t >= clock - 30:
            out.append(round(t))
        t += interval
    return out or [round(s.next_objective_at)]


def compute_overlay(s: LiveSession) -> dict[str, Any]:
    clock = s.clock() if s.status == "in_game" else None
    info = registry().maps.get(s.map_id or "")
    alerts: list[dict[str, Any]] = []
    tips: list[str] = []

    # Objectif
    objective = None
    if info:
        remaining = None
        if clock is not None and s.next_objective_at is not None:
            remaining = s.next_objective_at - clock
            interval = s.timings.get("objective_interval_s")
            if remaining < -90 and interval:  # pas de « objectif terminé » : on projette le suivant
                s.next_objective_at += interval
                remaining += interval
        priority = "Farm, soak d'XP et camps"
        if remaining is not None and remaining <= OBJECTIVE_WARNING_S:
            priority = "Regroupement pour l'objectif"
            if remaining > 0:
                alerts.append({"id": "objective", "priority": 2, "level": "warning",
                               "text": f"Objectif dans {int(remaining)} s : regroupez-vous."})
        objective = {
            "name": info.objective, "map": info.name, "next_in_s": remaining,
            "source": s.timings.get("source", "estimation"), "samples": s.timings.get("samples", 0),
            "priority": priority, "tips": list(info.tips),
        }

    # Camps
    camps = []
    for c in sorted(s.camps, key=lambda c: c.respawn_at):
        left = None if clock is None else c.respawn_at - clock
        if left is not None and left < -60:
            continue  # camp disponible depuis longtemps : on ne l'affiche plus
        camps.append({"camp": c.camp_type, "side": c.side, "respawn_in_s": left})
        if left is not None and 0 < left <= 20 and c.side == "ally":
            alerts.append({"id": f"camp-{c.camp_type}", "priority": 3, "level": "info",
                           "text": f"Camp {c.camp_type} disponible dans {int(left)} s."})

    # Powerspikes (niveaux d'équipe lus en haut de l'écran ou saisis) — rien si inconnus
    known = s.level_source is not None
    ally_level, enemy_level = s.ally_level, s.enemy_level
    ally_tier, enemy_tier = talent_tier(ally_level), talent_tier(enemy_level)
    if s.status == "in_game" and known:
        if enemy_tier > ally_tier:
            alerts.append({"id": "talent-disadvantage", "priority": 1, "level": "danger",
                           "text": "Désavantage de talent : évitez les combats."})
            tips.append("Ne forcez pas un combat en infériorité de talent.")
        elif ally_tier > enemy_tier:
            lvl = TALENT_LEVELS[ally_tier - 1]
            tips.append(f"Avantage niveau {lvl} : forcez l'objectif ou un combat.")
        if ally_level in (9, 15, 19):
            tips.append(f"Niveau {ally_level + 1} imminent : attendez le talent avant d'engager.")
        if objective and objective["next_in_s"] is not None and 0 < objective["next_in_s"] <= OBJECTIVE_WARNING_S:
            tips.append("Restez groupés.")

    now = time.monotonic()
    for key, (text, level, until) in list(s._flashes.items()):
        if until < now:
            del s._flashes[key]
        else:
            alerts.append({"id": key, "priority": 0, "level": level, "text": text})
    alerts.sort(key=lambda a: a["priority"])
    for a in alerts:
        a["voice"] = True

    # Talent à venir (le plus utile en jeu) + build complet
    next_talent = None
    for t in s.talent_build if known else []:
        if t["level"] > ally_level:
            next_talent = t
            break

    return {
        "status": s.status,
        "game_id": s.game_id,
        "game_running": s.game_running,
        "clock_s": clock,
        "clock_source": s.clock_source,
        "map_id": s.map_id,
        "map_name": info.name if info else None,
        "map_source": s.map_source,
        "my_hero_id": s.my_hero_id,
        "lobby_players": s.lobby_players,
        "levels": ({"ally": ally_level, "enemy": enemy_level, "ally_tier": ally_tier,
                    "enemy_tier": enemy_tier, "source": s.level_source} if known else None),
        "teams": teams_from(s.composition),
        "objective": objective,
        "upcoming_objectives": _upcoming(s, clock),
        "camps": camps,
        "talents": s.talent_build,
        "next_talent": next_talent,
        "alerts": alerts[:MAX_ALERTS],
        "tips": tips[:2],
        "sources": ["game_process", "battlelobby_file", "screen_reading", "user_input", "static_data", "own_history"],
    }


live_session = LiveSession()
