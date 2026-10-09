"""Détection du lancement d'une partie via le fichier battlelobby.

Au chargement, le jeu écrit `replay.server.battlelobby` dans
%TEMP%\\Heroes of the Storm\\...\\TempWriteReplayP*\\. On ne s'en sert que comme
signal de début de partie et pour lister les BattleTags affichés à l'écran de
chargement. Aucune autre donnée temps réel n'est lue.
"""
from __future__ import annotations

import logging
import re
from collections.abc import Callable
from pathlib import Path

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

log = logging.getLogger(__name__)

BATTLELOBBY_NAME = "replay.server.battlelobby"
_BATTLETAG_RE = re.compile(rb"([A-Za-z\xc0-\xff][\w\x80-\xff]{1,15})#(\d{3,7})")


def extract_battletags(data: bytes) -> list[str]:
    seen: list[str] = []
    for name, digits in _BATTLETAG_RE.findall(data):
        tag = f"{name.decode('utf-8', errors='ignore')}#{digits.decode()}"
        if tag not in seen:
            seen.append(tag)
    return seen[:10]


class _Handler(FileSystemEventHandler):
    def __init__(self, on_lobby: Callable[[list[str]], None]) -> None:
        self.on_lobby = on_lobby

    def _maybe(self, path: str) -> None:
        if Path(path).name != BATTLELOBBY_NAME:
            return
        try:
            data = Path(path).read_bytes()
        except OSError:
            data = b""
        self.on_lobby(extract_battletags(data))

    def on_created(self, event: FileSystemEvent) -> None:
        self._maybe(str(event.src_path))

    def on_modified(self, event: FileSystemEvent) -> None:
        self._maybe(str(event.src_path))


class LobbyWatcher:
    def __init__(self, temp_dir: Path, on_lobby: Callable[[list[str]], None]) -> None:
        self.temp_dir = temp_dir
        self.on_lobby = on_lobby
        self._observer: Observer | None = None

    def start(self) -> None:
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        self._observer = Observer()
        self._observer.schedule(_Handler(self.on_lobby), str(self.temp_dir), recursive=True)
        self._observer.start()
        log.info("Détection de partie : %s", self.temp_dir)

    def stop(self) -> None:
        if self._observer:
            self._observer.stop()
            self._observer.join(timeout=5)
