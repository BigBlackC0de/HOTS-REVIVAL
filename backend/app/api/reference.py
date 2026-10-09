from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.analytics.profile_stats import talent_stats
from app.db import get_db
from app.live.compliance import describe
from app.reference import registry

router = APIRouter(tags=["référentiel"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/compliance")
def compliance() -> dict:
    return describe()


@router.get("/heroes")
def heroes() -> list[dict]:
    return [
        {"id": h.id, "name": h.name, "role": h.role, "tags": sorted(h.tags), "curve": h.curve}
        for h in sorted(registry().heroes.values(), key=lambda h: h.name)
    ]


@router.get("/maps")
def maps() -> list[dict]:
    return [
        {"id": m.id, "name": m.name, "objective": m.objective, "first_objective_s": m.first_objective_s,
         "objective_interval_s": m.objective_interval_s, "verified": m.verified, "tips": list(m.tips)}
        for m in registry().maps.values()
    ]


@router.get("/talents/{hero_id}")
def talents(hero_id: str, db: Session = Depends(get_db)) -> dict:
    return {"hero_id": hero_id, "tiers": talent_stats(db, hero_id)}
