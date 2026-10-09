from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import Settings, app_settings
from app.db import get_db
from app.models import Replay
from app.replay.importer import ImportResult
from app.replay.watcher import REPLAY_SUFFIX, ReplayImporter
from app.schemas import ImportRequest, ImportResponse

router = APIRouter(prefix="/replays", tags=["replays"])


@router.get("/status")
def status(request: Request, db: Session = Depends(get_db), settings: Settings = Depends(app_settings)) -> dict:
    counts = dict(db.execute(select(Replay.status, func.count()).group_by(Replay.status)).all())
    folder = settings.resolved_replay_dir()
    return {
        "folder": str(folder) if folder else None,
        "folder_exists": bool(folder and folder.is_dir()),
        "watching": getattr(request.app.state, "replay_watcher", None) is not None,
        "toon_handle": settings.resolved_toon_handle(),
        "counts": counts,
    }


@router.post("/import", response_model=ImportResponse)
def import_replays(
    body: ImportRequest, request: Request, settings: Settings = Depends(app_settings)
) -> ImportResponse:
    importer: ReplayImporter | None = getattr(request.app.state, "replay_importer", None)
    target = Path(body.path) if body.path else settings.resolved_replay_dir()
    if target is None or not target.exists():
        raise HTTPException(400, f"Chemin introuvable : {target}")
    importer = importer or ReplayImporter(target, settings.resolved_toon_handle())

    results: list[ImportResult]
    if target.is_dir():
        results = [importer.import_path(p) for p in sorted(target.glob(f"*{REPLAY_SUFFIX}"))]
    else:
        results = [importer.import_path(target)]
    return ImportResponse(
        imported=sum(r.status == "imported" for r in results),
        duplicates=sum(r.status == "duplicate" for r in results),
        failed=sum(r.status == "failed" for r in results),
        match_ids=[r.match_id for r in results if r.match_id],
    )
