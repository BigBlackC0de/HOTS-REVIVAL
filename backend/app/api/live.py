from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.analytics.profile_stats import talent_stats
from app.db import get_db
from app.events import hub
from app.live.session import live_session
from app.analytics.timings import map_timings
from app.schemas import LiveCampRequest, LiveHeroRequest, LiveLevelsRequest, LiveStartRequest, LiveSyncRequest

router = APIRouter(prefix="/live", tags=["overlay"])
ws_router = APIRouter()


def recommended_build(db: Session, hero_id: str) -> list[dict]:
    build = []
    for tier in talent_stats(db, hero_id):
        options = tier["options"]
        if options:
            build.append({"level": tier["level"], "recommended": options[0], "alternatives": options[1:3]})
    return build


@router.get("/state")
def state() -> dict:
    return live_session.snapshot()


@router.post("/start")
def start(body: LiveStartRequest, db: Session = Depends(get_db)) -> dict:
    map_id = body.map_id or live_session.map_id
    timings = map_timings(db, map_id) if map_id else None
    live_session.start(body.map_id, body.my_hero_id, body.clock_s, timings)
    if live_session.my_hero_id:
        live_session.talent_build = recommended_build(db, live_session.my_hero_id)
    return live_session.snapshot()


@router.post("/hero")
def set_hero(body: LiveHeroRequest, db: Session = Depends(get_db)) -> dict:
    live_session.my_hero_id = body.hero_id
    live_session.talent_build = recommended_build(db, body.hero_id)
    return live_session.snapshot()


@router.post("/sync")
def sync(body: LiveSyncRequest) -> dict:
    live_session.sync_clock(body.clock_s, body.source)
    return live_session.snapshot()


@router.post("/levels")
def levels(body: LiveLevelsRequest) -> dict:
    ally = body.ally if body.ally is not None else (
        live_session.ally_level + body.ally_delta if body.ally_delta else None)
    enemy = body.enemy if body.enemy is not None else (
        live_session.enemy_level + body.enemy_delta if body.enemy_delta else None)
    live_session.set_levels(ally, enemy, body.source)
    return live_session.snapshot()


@router.post("/objective-done")
def objective_done() -> dict:
    live_session.objective_done()
    return live_session.snapshot()


@router.post("/camp")
def camp(body: LiveCampRequest) -> dict:
    live_session.camp_taken(body.camp_type, body.side)
    return live_session.snapshot()


@router.post("/stop")
def stop() -> dict:
    live_session.stop()
    return live_session.snapshot()


@ws_router.websocket("/ws/live")
async def live_ws(ws: WebSocket) -> None:
    """Pousse l'état de l'overlay chaque seconde + les évènements (nouveau replay…)."""
    await hub.connect(ws)
    try:
        while True:
            await ws.send_json({"type": "overlay", "state": live_session.snapshot()})
            await asyncio.sleep(1)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        hub.disconnect(ws)
