"""Construction du contexte joueur transmis au coach."""
from __future__ import annotations

import json
from dataclasses import asdict

from sqlalchemy.orm import Session

from app.analytics.profile_stats import build_profile, my_match_lines
from app.coach.roles import role_balance, role_context
from app.meta.service import all_tiers, hero_guide
from app.models import MatchPlayer, Report
from app.reference import registry
from app.talents import talent_name


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
    from app.api.profile import current_rank

    rank = current_rank(db)
    if rank:
        ctx["rang_declare"] = rank["label"]
    balance = role_balance(profile["by_role"])
    ctx["repartition_des_roles"] = balance
    tiers = all_tiers(db, "general")
    if balance["advice"] and tiers:
        # héros bien classés dans les rôles de dégâts que le joueur joue peu
        other_roles = [r for r in ("Ranged Assassin", "Melee Assassin", "Bruiser") if r != balance["main_role"]]
        ctx["pistes_second_role"] = [
            {"hero": registry().heroes[h].name, "role": registry().heroes[h].role, "tier": t,
             "parties_jouees": profile["by_hero"].get(h, {}).get("games", 0)}
            for h, t in tiers.items()
            if t in ("S", "A") and h in registry().heroes and registry().heroes[h].role in other_roles
        ][:8]

    if match_id is not None:
        report = db.query(Report).filter(Report.match_id == match_id).first()
        if report:
            ctx["partie_analysee"] = report.facts
            me = db.get(MatchPlayer, report.match_player_id)
            if me:
                role = role_context(me.role)
                ctx["role_joue"] = {"role": role["label"], "a_surveiller": role["focus"],
                                    "reperes": role["normal"], "habitudes_des_meilleurs_joueurs": role["habits"]}
                guide = hero_guide(db, me.hero_id)
                if guide:
                    chosen = {t["level"]: talent_name(t["name"]) for t in me.talents or []}
                    ctx["guide_icy_veins_du_heros"] = {
                        "heros": me.hero_name,
                        "builds": [{"titre": b["title"], "talents": {t["level"]: t["name"] for t in b["talents"]}}
                                   for b in guide["builds"][:2]],
                        "talents_choisis_par_le_joueur": chosen,
                        "synergies": [h["hero"] for h in guide["synergies"]],
                        "contre_par": [h["hero"] for h in guide["counters"]],
                        "source": guide["url"],
                    }
    return "Données du joueur (JSON) :\n" + json.dumps(ctx, ensure_ascii=False, default=str)
