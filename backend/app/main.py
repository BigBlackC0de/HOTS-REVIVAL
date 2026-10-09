"""Point d'entrée FastAPI : `uvicorn app.main:app --port 8765`."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api import coach, draft, live, matches, profile, reference, replays, settings as settings_api
from app.config import Settings, get_settings
from app.db import create_schema, init_engine
from app.events import hub
from app.live.battlelobby import LobbyWatcher
from app.live.session import live_session
from app.observability import init_observability, track
from app.replay.importer import ImportResult
from app.replay.watcher import ReplayImporter, ReplayWatcher

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("hots_revival")


def _on_import(path: Path, result: ImportResult) -> None:
    if result.status == "imported":
        track("replay_imported")
        hub.publish_threadsafe({"type": "match_imported", "match_id": result.match_id, "file": path.name})
        live_session.stop()  # la partie est terminée : l'overlay repasse au repos


def _on_lobby(players: list[str]) -> None:
    live_session.on_lobby(players)
    hub.publish_threadsafe({"type": "game_loading", "players": players})


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
        app.state.lobby_watcher = None
        start_replay_watching(app, start_watchers)
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
                   draft.router, coach.router, live.router, settings_api.router):
        app.include_router(router, prefix="/api")
    app.include_router(live.ws_router)
    return app


app = create_app()
