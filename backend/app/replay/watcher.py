"""Surveillance du dossier de replays (watchdog) et import automatique."""
from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from pathlib import Path

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

from app.db import SessionLocal
from app.replay.importer import ImportResult, import_replay_file

log = logging.getLogger(__name__)
REPLAY_SUFFIX = ".StormReplay"


def wait_until_stable(path: Path, interval: float = 1.0, checks: int = 3, timeout: float = 60) -> bool:
    """Le jeu écrit le replay en plusieurs fois : attendre une taille stable."""
    deadline, last, stable = time.monotonic() + timeout, -1, 0
    while time.monotonic() < deadline:
        try:
            size = path.stat().st_size
        except FileNotFoundError:
            return False
        stable = stable + 1 if size == last and size > 0 else 0
        if stable >= checks:
            return True
        last = size
        time.sleep(interval)
    return False


class ReplayImporter:
    def __init__(self, folder: Path, me_toon: str | None,
                 on_result: Callable[[Path, ImportResult], None] | None = None) -> None:
        self.folder = folder
        self.me_toon = me_toon
        self.on_result = on_result
        self._lock = threading.Lock()

    def import_path(self, path: Path) -> ImportResult:
        with self._lock, SessionLocal() as db:
            result = import_replay_file(db, path, self.me_toon)
        log.info("Replay %s : %s", path.name, result.status)
        if self.on_result:
            self.on_result(path, result)
        return result

    def scan(self) -> list[ImportResult]:
        if not self.folder.is_dir():
            return []
        files = sorted(self.folder.glob(f"*{REPLAY_SUFFIX}"), key=lambda p: p.stat().st_mtime)
        return [self.import_path(p) for p in files]


class _Handler(FileSystemEventHandler):
    def __init__(self, importer: ReplayImporter) -> None:
        self.importer = importer

    def _handle(self, raw_path: str) -> None:
        path = Path(raw_path)
        if path.suffix != REPLAY_SUFFIX:
            return

        def work() -> None:
            if wait_until_stable(path):
                self.importer.import_path(path)

        threading.Thread(target=work, daemon=True).start()

    def on_created(self, event: FileSystemEvent) -> None:
        if not event.is_directory:
            self._handle(str(event.src_path))

    def on_moved(self, event: FileSystemEvent) -> None:
        if not event.is_directory:
            self._handle(str(event.dest_path))


class ReplayWatcher:
    def __init__(self, importer: ReplayImporter) -> None:
        self.importer = importer
        self._observer: Observer | None = None

    def start(self) -> None:
        if not self.importer.folder.is_dir():
            log.warning("Dossier de replays introuvable : %s", self.importer.folder)
            return
        threading.Thread(target=self.importer.scan, daemon=True).start()  # rattrapage initial
        self._observer = Observer()
        self._observer.schedule(_Handler(self.importer), str(self.importer.folder), recursive=False)
        self._observer.start()
        log.info("Surveillance des replays : %s", self.importer.folder)

    def stop(self) -> None:
        if self._observer:
            self._observer.stop()
            self._observer.join(timeout=5)
