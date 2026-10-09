from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.analytics.profile_stats import build_profile, talent_stats
from app.db import get_db
from app.meta import service
from app.reference import registry
from app.talents import catalog

router = APIRouter(prefix="/meta", tags=["méta"])


class IngestRequest(BaseModel):
    kind: str = Field(pattern="^(tierlist|guide)$")
    key: str = Field(max_length=48)
    url: str = Field(max_length=300)
    html: str = Field(max_length=6_000_000)


@router.get("/pending")
def pending(force: bool = False, db: Session = Depends(get_db)) -> list[dict]:
    return service.pending(db, force)


@router.post("/ingest")
def ingest(body: IngestRequest, db: Session = Depends(get_db)) -> dict:
    return service.ingest(db, body.kind, body.key, body.url, body.html)


@router.post("/refresh")
def refresh(force: bool = False, db: Session = Depends(get_db)) -> dict:
    """Repli serveur (sans navigateur) ; l'application desktop utilise son navigateur intégré."""
    return service.refresh_direct(db, force)


@router.get("/tierlists")
def tierlists(db: Session = Depends(get_db)) -> list[dict]:
    lists = service.tier_lists(db)
    by_hero = build_profile(db).by_hero
    for tl in lists:
        for e in tl["entries"]:
            mine = by_hero.get(e["hero_id"])
            e["my_games"] = mine["games"] if mine else 0
            e["my_winrate"] = mine["winrate"] if mine else None
    return lists


@router.get("/combos")
def combos(db: Session = Depends(get_db)) -> list[dict]:
    return service.best_combos(db)


@router.get("/heroes/{hero_id}")
def hero(hero_id: str, db: Session = Depends(get_db)) -> dict:
    if hero_id not in registry().heroes:
        raise HTTPException(404, "Héros inconnu")
    h = registry().heroes[hero_id]
    talents = catalog().get(hero_id, {}).get("talents", {})
    return {
        "hero_id": hero_id, "hero": h.name, "role": h.role,
        "tiers": {key: service.tier_of(db, hero_id, key) for key in ("general", "master", "quick_match", "aram")},
        "guide": service.hero_guide(db, hero_id),
        "talent_catalog": talents,
        "replay_talent_stats": talent_stats(db, hero_id),
    }
