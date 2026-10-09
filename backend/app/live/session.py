"""État de la partie en cours, construit UNIQUEMENT à partir de sources autorisées
(voir compliance.ALLOWED_SOURCES) : horloge synchronisée par le joueur, carte
choisie, niveaux d'équipe visibles à l'écran, camps observés."""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any

from app.reference import registry

TALENT_LEVELS = (1, 4, 7, 10, 13, 16, 20)
OBJECTIVE_WARNING_S = 45


def talent_tier(level: int) -> int:
    return sum(1 for lvl in TALENT_LEVELS if level >= lvl)


@dataclass
class CampTimer:
    camp_type: str
    side: str  # "ally" | "enemy"
    respawn_at: float  # horloge de jeu (s)


@dataclass
class LiveSession:
    status: str = "idle"  # idle | loading | in_game
    map_id: str | None = None
    my_hero_id: str | None = None
    lobby_players: list[str] = field(default_factory=list)
    clock_anchor: float | None = None  # time.monotonic() correspondant à 0:00
    next_objective_at: float | None = None
    ally_level: int = 1
    enemy_level: int = 1
    camps: list[CampTimer] = field(default_factory=list)
    talent_build: list[dict] = field(default_factory=list)
    _announced: set[str] = field(default_factory=set)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    # ---- transitions (déclenchées par le joueur ou le fichier battlelobby)
    def on_lobby(self, players: list[str]) -> None:
        with self._lock:
            self.reset_locked()
            self.status, self.lobby_players = "loading", players

    def start(self, map_id: str | None, my_hero_id: str | None, clock_s: float = 0.0) -> None:
        with self._lock:
            if self.status == "idle":
                self.reset_locked()
            self.status = "in_game"
            self.map_id = map_id or self.map_id
            self.my_hero_id = my_hero_id or self.my_hero_id
            self.clock_anchor = time.monotonic() - clock_s
            info = registry().maps.get(self.map_id or "")
            self.next_objective_at = float(info.first_objective_s) if info and info.first_objective_s else None

    def sync_clock(self, clock_s: float) -> None:
        with self._lock:
            self.clock_anchor = time.monotonic() - clock_s
            if self.status != "in_game":
                self.status = "in_game"

    def set_levels(self, ally: int | None, enemy: int | None) -> None:
        with self._lock:
            if ally is not None:
                self.ally_level = max(1, min(30, ally))
            if enemy is not None:
                self.enemy_level = max(1, min(30, enemy))

    def objective_done(self) -> None:
        with self._lock:
            info = registry().maps.get(self.map_id or "")
            now = self.clock()
            if info and info.objective_interval_s and now is not None:
                self.next_objective_at = now + info.objective_interval_s

    def camp_taken(self, camp_type: str, side: str) -> None:
        with self._lock:
            now = self.clock() or 0.0
            respawn = registry().camp_respawn_s.get(camp_type, registry().camp_respawn_s["other"])
            self.camps = [c for c in self.camps if not (c.camp_type == camp_type and c.side == side)]
            self.camps.append(CampTimer(camp_type, side, now + respawn))

    def stop(self) -> None:
        with self._lock:
            self.reset_locked()

    def reset_locked(self) -> None:
        self.status, self.map_id, self.my_hero_id = "idle", None, None
        self.lobby_players, self.clock_anchor, self.next_objective_at = [], None, None
        self.ally_level = self.enemy_level = 1
        self.camps, self.talent_build, self._announced = [], [], set()

    # ---- lecture
    def clock(self) -> float | None:
        return None if self.clock_anchor is None else max(0.0, time.monotonic() - self.clock_anchor)

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return compute_overlay(self)


def compute_overlay(s: LiveSession) -> dict[str, Any]:
    clock = s.clock()
    info = registry().maps.get(s.map_id or "")
    alerts: list[dict[str, str]] = []
    tips: list[str] = []

    def alert(key: str, text: str, level: str = "info") -> None:
        alerts.append({"id": key, "text": text, "level": level, "new": key not in s._announced})
        s._announced.add(key)

    # Objectif
    objective = None
    if info and clock is not None:
        remaining = None if s.next_objective_at is None else s.next_objective_at - clock
        if remaining is not None and remaining < -60 and info.objective_interval_s:
            # pas de confirmation du joueur : on projette l'objectif suivant (estimation)
            s.next_objective_at += info.objective_interval_s
            remaining += info.objective_interval_s
        priority = "Farm / soak XP / camps"
        if remaining is not None and remaining <= OBJECTIVE_WARNING_S:
            priority = "Regroupement pour l'objectif"
            if remaining > 0:
                alert(f"obj-{int(s.next_objective_at or 0)}",
                      f"Le prochain objectif arrive dans {int(remaining)} secondes.", "warning")
        objective = {
            "name": info.objective, "map": info.name, "next_in_s": remaining,
            "estimated": not info.verified, "priority": priority, "tips": list(info.tips),
        }

    # Camps
    camps = []
    for c in sorted(s.camps, key=lambda c: c.respawn_at):
        left = None if clock is None else c.respawn_at - clock
        camps.append({"camp": c.camp_type, "side": c.side, "respawn_in_s": left})
        if left is not None and 0 < left <= 20 and c.side == "ally":
            alert(f"camp-{c.camp_type}-{int(c.respawn_at)}", f"Camp {c.camp_type} disponible dans {int(left)} s.")

    # Powerspikes (niveaux affichés publiquement en haut de l'écran)
    ally_tier, enemy_tier = talent_tier(s.ally_level), talent_tier(s.enemy_level)
    for lvl in (10, 16, 20):
        if s.ally_level >= lvl:
            alert(f"ally-{lvl}", f"Niveau {lvl} atteint.", "success")
    if enemy_tier > ally_tier:
        alert(f"enemy-adv-{enemy_tier}", "L'équipe adverse possède un avantage de talent.", "danger")
        tips.append("Ne forcez pas un combat en infériorité de talent.")
    elif ally_tier > enemy_tier:
        lvl = TALENT_LEVELS[ally_tier - 1]
        tips.append(f"Votre équipe possède un avantage niveau {lvl} : forcez l'objectif ou un combat.")
    if objective and objective["next_in_s"] is not None and 0 < objective["next_in_s"] <= OBJECTIVE_WARNING_S:
        tips.append("Restez groupés.")
    if s.ally_level in (9, 15, 19):
        tips.append(f"Niveau {s.ally_level + 1} imminent : attendez le talent avant d'engager.")

    return {
        "status": s.status,
        "clock_s": clock,
        "map_id": s.map_id,
        "my_hero_id": s.my_hero_id,
        "lobby_players": s.lobby_players,
        "levels": {"ally": s.ally_level, "enemy": s.enemy_level, "ally_tier": ally_tier, "enemy_tier": enemy_tier},
        "objective": objective,
        "camps": camps,
        "talents": s.talent_build,
        "alerts": alerts,
        "tips": tips,
        "sources": ["user_input", "battlelobby_file", "static_data", "own_history"],
    }


live_session = LiveSession()
