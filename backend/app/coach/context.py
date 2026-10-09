"""Construction du contexte joueur transmis au coach."""
from __future__ import annotations

import json
from dataclasses import asdict

from sqlalchemy.orm import Session

from app.analytics.profile_stats import build_profile, my_match_lines
from app.models import Report


def player_context(db: Session, match_id: int | None = None) -> str:
    profile = asdict(build_profile(db))
    top_heroes = sorted(profile["by_hero"].values(), key=lambda h: h["games"], reverse=True)[:8]
    recent = []
    for mp in my_match_lines(db, limit=8):
        recent.append({
            "match_id": mp.match_id, "map": mp.match.map_name, "hero": mp.hero_name,
            "win": mp.is_winner, "kda": f"{mp.kills}/{mp.deaths}/{mp.assists}",
            "heros_score": mp.score.overall if mp.score else None,
        })
    ctx: dict = {
        "profil": {k: profile[k] for k in (
            "total", "by_role", "best_hero", "worst_hero", "main_role", "secondary_role",
            "heroes_to_avoid", "trend", "category_averages")},
        "heros_les_plus_joues": top_heroes,
        "dernieres_parties": recent,
    }
    if match_id is not None:
        report = db.query(Report).filter(Report.match_id == match_id).first()
        if report:
            ctx["partie_analysee"] = report.facts
    return "Données du joueur (JSON) :\n" + json.dumps(ctx, ensure_ascii=False, default=str)
