from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analytics.profile_stats import build_profile, progression
from app.config import Settings, app_settings
from app.db import get_db
from app.models import Player

router = APIRouter(prefix="/profile", tags=["profil"])


@router.get("")
def get_profile(db: Session = Depends(get_db), settings: Settings = Depends(app_settings)) -> dict:
    me = db.scalar(select(Player).where(Player.is_me.is_(True)))
    return {
        "player": {
            "name": me.name if me else None,
            "battletag": settings.player_battletag or (me.battletag if me else None),
            "toon_handle": settings.resolved_toon_handle(),
            "rank": me.rank if me else None,
        },
        **asdict(build_profile(db)),
    }


@router.get("/progression")
def get_progression(db: Session = Depends(get_db)) -> list[dict]:
    return progression(db)
