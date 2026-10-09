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
    def __init__(self, folders: Path | list[Path], me_toons: list[str] | str | None,
                 on_result: Callable[[Path, ImportResult], None] | None = None) -> None:
        self.folders = folders if isinstance(folders, list) else [folders]
        self.me_toons = [me_toons] if isinstance(me_toons, str) else list(me_toons or [])
        self.on_result = on_result
        self._lock = threading.Lock()

    @property
    def folder(self) -> Path:
        return self.folders[0]

    def import_path(self, path: Path) -> ImportResult:
        with self._lock, SessionLocal() as db:
            result = import_replay_file(db, path, self.me_toons)
        log.info("Replay %s : %s", path.name, result.status)
        if self.on_result:
            self.on_result(path, result)
        return result

    def scan(self) -> list[ImportResult]:
        files = [f for d in self.folders if d.is_dir() for f in d.glob(f"*{REPLAY_SUFFIX}")]
        files.sort(key=lambda p: p.stat().st_mtime)
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
        folders = [d for d in self.importer.folders if d.is_dir()]
        if not folders:
            log.warning("Dossier de replays introuvable : %s", self.importer.folders)
            return
        threading.Thread(target=self._initial_scan, daemon=True).start()  # rattrapage initial
        self._observer = Observer()
        for folder in folders:
            self._observer.schedule(_Handler(self.importer), str(folder), recursive=False)
            log.info("Surveillance des replays : %s", folder)
        self._observer.start()

    def _initial_scan(self) -> None:
        from app.replay.reanalyze import mark_done, needs_reanalysis, reanalyze_all

        if needs_reanalysis():
            reanalyze_all(self.importer)  # analyseur mis à jour : on repasse sur tout l'historique
        else:
            self.importer.scan()
            mark_done()

    def stop(self) -> None:
        if self._observer:
            self._observer.stop()
            self._observer.join(timeout=5)
