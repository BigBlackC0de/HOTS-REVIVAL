from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analytics.profile_stats import build_profile, progression
from app.coach.roles import role_balance
from app.config import Settings, app_settings
from app.db import get_db
from app.models import Player, RankSnapshot

router = APIRouter(prefix="/profile", tags=["profil"])


@router.get("")
def get_profile(db: Session = Depends(get_db), settings: Settings = Depends(app_settings)) -> dict:
    me = db.scalar(select(Player).where(Player.is_me.is_(True)))
    return {
        "player": {
            "name": me.name if me else None,
            "battletag": settings.player_battletag or (me.battletag if me else None),
            "toon_handle": settings.resolved_toon_handle(),
            "rank": (rank := current_rank(db)) and rank["label"],
        },
        **(summary := asdict(build_profile(db))),
        "role_balance": role_balance(summary["by_role"]),
    }


LEAGUES = ("Bronze", "Argent", "Or", "Platine", "Diamant", "Maître", "Grand Maître")


class RankIn(BaseModel):
    league: str = Field(max_length=24)
    division: int | None = Field(None, ge=1, le=5)
    mode: str = Field("Storm League", max_length=32)


def _rank_dict(r: RankSnapshot) -> dict:
    label = r.league if r.division is None or r.league in ("Maître", "Grand Maître") else f"{r.league} {r.division}"
    return {"id": r.id, "mode": r.mode, "league": r.league, "division": r.division, "label": label,
            "recorded_at": r.recorded_at.isoformat()}


def current_rank(db: Session) -> dict | None:
    r = db.scalar(select(RankSnapshot).order_by(RankSnapshot.recorded_at.desc(), RankSnapshot.id.desc()))
    return _rank_dict(r) if r else None


@router.get("/ranks")
def ranks(db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(select(RankSnapshot).order_by(RankSnapshot.recorded_at.desc(), RankSnapshot.id.desc()).limit(50))
    return {"leagues": LEAGUES, "history": [_rank_dict(r) for r in rows]}


@router.post("/ranks")
def add_rank(body: RankIn, db: Session = Depends(get_db)) -> dict:
    if body.league not in LEAGUES:
        raise HTTPException(400, "Ligue inconnue")
    r = RankSnapshot(league=body.league, division=body.division, mode=body.mode)
    db.add(r)
    db.commit()
    return _rank_dict(r)


@router.get("/progression")
def get_progression(db: Session = Depends(get_db)) -> list[dict]:
    return progression(db)
