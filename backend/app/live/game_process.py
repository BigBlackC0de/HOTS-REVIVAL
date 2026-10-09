"""Détecte si Heroes of the Storm est lancé, en listant les processus (comme le
fait Discord). Aucune ouverture du processus, aucune lecture de sa mémoire."""
from __future__ import annotations

import logging
import threading
from collections.abc import Callable

import psutil

log = logging.getLogger(__name__)
GAME_PROCESS_NAMES = {"heroesofthestorm_x64.exe", "heroesofthestorm.exe", "heroes of the storm"}


def is_game_running() -> bool:
    for proc in psutil.process_iter(["name"]):
        name = (proc.info.get("name") or "").lower()
        if name in GAME_PROCESS_NAMES:
            return True
    return False


class GameProcessMonitor:
    def __init__(self, on_change: Callable[[bool], None], interval_s: float = 3.0) -> None:
        self.on_change = on_change
        self.interval_s = interval_s
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.running: bool | None = None

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                running = is_game_running()
            except Exception:  # accès refusé à un processus système, etc.
                log.debug("Liste des processus indisponible", exc_info=True)
                running = bool(self.running)
            if running != self.running:
                self.running = running
                self.on_change(running)
            self._stop.wait(self.interval_s)

    def start(self) -> None:
        self._thread = threading.Thread(target=self._loop, daemon=True, name="game-process")
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
