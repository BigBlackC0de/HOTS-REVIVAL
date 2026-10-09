from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.coach.client import CoachUnavailable, coach_available, deterministic_summary, generate_game_summary
from app.coach.context import player_context
from app.config import Settings, app_settings
from app.db import get_db
from app.models import Match, MatchPlayer, Report
from app.observability import track
from app.schemas import MatchDetailOut, MatchPlayerOut, MatchSummaryOut, ReportOut

router = APIRouter(prefix="/matches", tags=["parties"])


def _me(match: Match) -> MatchPlayer | None:
    return next((p for p in match.players if p.is_me), None)


@router.get("", response_model=list[MatchSummaryOut])
def list_matches(
    limit: int = Query(20, le=100), offset: int = 0, hero_id: str | None = None, db: Session = Depends(get_db)
) -> list[MatchSummaryOut]:
    stmt = (
        select(Match)
        .options(selectinload(Match.players).selectinload(MatchPlayer.score))
        .order_by(Match.played_at.desc().nullslast(), Match.id.desc())
    )
    if hero_id:
        stmt = stmt.where(Match.players.any((MatchPlayer.is_me.is_(True)) & (MatchPlayer.hero_id == hero_id)))
    out = []
    for m in db.scalars(stmt.offset(offset).limit(limit)):
        me = _me(m)
        item = MatchSummaryOut.model_validate(m)
        item.me = MatchPlayerOut.model_validate(me) if me else None
        out.append(item)
    return out


def _get_match(db: Session, match_id: int) -> Match:
    match = db.get(Match, match_id, options=[selectinload(Match.players).selectinload(MatchPlayer.score),
                                             selectinload(Match.events)])
    if not match:
        raise HTTPException(404, "Partie introuvable")
    return match


@router.get("/{match_id}", response_model=MatchDetailOut)
def get_match(match_id: int, db: Session = Depends(get_db)) -> MatchDetailOut:
    match = _get_match(db, match_id)
    out = MatchDetailOut.model_validate(match)
    me = _me(match)
    out.me = MatchPlayerOut.model_validate(me) if me else None
    return out


def _report(db: Session, match_id: int) -> Report:
    report = db.scalar(select(Report).where(Report.match_id == match_id))
    if not report:
        raise HTTPException(404, "Aucun rapport : le joueur local n'a pas été identifié dans cette partie.")
    return report


@router.get("/{match_id}/report", response_model=ReportOut)
def get_report(match_id: int, db: Session = Depends(get_db)) -> ReportOut:
    r = _report(db, match_id)
    return ReportOut(match_id=match_id, facts=r.facts, ai_summary=r.ai_summary, model=r.model)


@router.post("/{match_id}/report/ai", response_model=ReportOut)
async def generate_report(
    match_id: int, db: Session = Depends(get_db), settings: Settings = Depends(app_settings)
) -> ReportOut:
    r = _report(db, match_id)
    summary, model = None, None
    if coach_available(settings):
        try:
            summary = await generate_game_summary(settings, r.facts, player_context(db))
            model = settings.claude_model
        except CoachUnavailable:
            summary = None
    if summary is None:
        summary, model = deterministic_summary(r.facts), "deterministic"
    r.ai_summary, r.model = summary.model_dump(), model
    db.commit()
    track("report_generated", {"model": model})
    return ReportOut(match_id=match_id, facts=r.facts, ai_summary=r.ai_summary, model=r.model)
