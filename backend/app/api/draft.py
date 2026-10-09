from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.analytics.profile_stats import build_profile, smoothed_winrate
from app.db import get_db
from app.draft.engine import analyze_draft
from app.models import Draft
from app.observability import track
from app.schemas import DraftRequest, DraftResponse

router = APIRouter(prefix="/draft", tags=["draft"])


@router.post("/analyze", response_model=DraftResponse)
def analyze(body: DraftRequest, db: Session = Depends(get_db)) -> DraftResponse:
    personal = None
    if body.use_personal_stats:
        by_hero = build_profile(db).by_hero
        personal = {h: smoothed_winrate(v["wins"], v["games"]) for h, v in by_hero.items() if v["games"] >= 3}
    result = analyze_draft(body.allies, body.enemies, body.map_id, body.bans, personal)
    db.add(Draft(map_id=body.map_id, allies=body.allies, enemies=body.enemies, bans=body.bans, result=asdict(result)))
    db.commit()
    track("draft_analyzed", {"allies": len(body.allies), "enemies": len(body.enemies)})
    return DraftResponse(**asdict(result))
