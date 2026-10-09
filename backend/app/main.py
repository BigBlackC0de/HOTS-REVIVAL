"""Point d'entrée FastAPI : `uvicorn app.main:app --port 8765`."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.analytics.timings import map_timings
from app.api import coach, draft, live, matches, meta, profile, reference, replays, settings as settings_api
from app.config import Settings, get_settings
from app.db import SessionLocal, create_schema, init_engine
from app.events import hub
from app.live.battlelobby import LobbyInfo, LobbyWatcher, learn_map
from app.live.game_process import GameProcessMonitor
from app.live.session import live_session
from app.models import Match
from app.observability import init_observability, track
from app.replay.importer import ImportResult
from app.replay.watcher import ReplayImporter, ReplayWatcher

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("hots_revival")


def _on_import(path: Path, result: ImportResult) -> None:
    if result.status != "imported":
        return
    track("replay_imported")
    # Apprentissage : l'empreinte de carte du fichier de chargement correspond à cette carte.
    if live_session.lobby_map_hash and result.match_id:
        with SessionLocal() as db:
            match = db.get(Match, result.match_id)
            if match:
                learn_map(live_session.lobby_map_hash, match.map_id)
    live_session.on_game_end()
    hub.publish_threadsafe({"type": "match_imported", "match_id": result.match_id, "file": path.name})


def _on_lobby(info: LobbyInfo) -> None:
    timings = {}
    if info.map_id:
        with SessionLocal() as db:
            timings = map_timings(db, info.map_id)
    live_session.on_lobby(info.battletags, info.map_id, info.map_source, info.map_hash, timings)
    hub.publish_threadsafe({"type": "game_loading", "players": info.battletags, "map_id": info.map_id})


def _on_process(running: bool) -> None:
    live_session.on_process(running)
    hub.publish_threadsafe({"type": "game_process", "running": running})


def start_replay_watching(app: FastAPI, start_watcher: bool = True) -> None:
    """(Re)démarre l'import automatique selon les réglages courants."""
    stop_replay_watching(app)
    settings: Settings = app.state.settings
    folder = settings.resolved_replay_dir()
    if folder:
        app.state.replay_importer = ReplayImporter(folder, settings.resolved_toon_handle(), _on_import)
        if start_watcher and settings.watch_replays:
            app.state.replay_watcher = ReplayWatcher(app.state.replay_importer)
            app.state.replay_watcher.start()


def stop_replay_watching(app: FastAPI) -> None:
    watcher = getattr(app.state, "replay_watcher", None)
    if watcher:
        watcher.stop()
    app.state.replay_watcher = app.state.replay_importer = None


def create_app(settings: Settings | None = None, start_watchers: bool = True) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        init_observability(settings)
        init_engine(settings.resolved_database_url())
        create_schema()
        hub.bind_loop(asyncio.get_running_loop())
        app.state.start_watchers = start_watchers
        app.state.lobby_watcher = app.state.process_monitor = None
        start_replay_watching(app, start_watchers)
        if start_watchers:
            app.state.process_monitor = GameProcessMonitor(_on_process)
            app.state.process_monitor.start()
        if start_watchers and settings.watch_live:
            try:
                app.state.lobby_watcher = LobbyWatcher(settings.resolved_live_dir(), _on_lobby)
                app.state.lobby_watcher.start()
            except OSError:
                log.warning("Détection de partie indisponible", exc_info=True)
        yield
        stop_replay_watching(app)
        if app.state.lobby_watcher:
            app.state.lobby_watcher.stop()
        if app.state.process_monitor:
            app.state.process_monitor.stop()

    app = FastAPI(title="HOTS REVIVAL API", version=__version__, lifespan=lifespan)
    app.state.settings = settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=r"^(file://.*|null)$",
        allow_methods=["*"],
        allow_headers=["*"],
    )
    for router in (reference.router, profile.router, matches.router, replays.router,
                   draft.router, coach.router, live.router, settings_api.router, meta.router):
        app.include_router(router, prefix="/api")
    app.include_router(live.ws_router)
    return app


app = create_app()
