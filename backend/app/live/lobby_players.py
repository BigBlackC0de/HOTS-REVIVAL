"""Joueurs de la partie (BattleTags affichés à l'écran de chargement) croisés avec
l'historique local du joueur : parties jouées avec / contre eux, héros favoris."""
from __future__ import annotations

from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.analytics.profile_stats import STATS_MODES
from app.models import Match, MatchPlayer


def lobby_players(db: Session, battletags: list[str]) -> list[dict]:
    my_lines = db.scalars(
        select(MatchPlayer).join(Match).where(MatchPlayer.is_me.is_(True), Match.game_mode.in_(STATS_MODES)).options(
            selectinload(MatchPlayer.match).selectinload(Match.players)
        )
    ).all()
    out = []
    for tag in battletags:
        name = tag.split("#")[0]
        with_games = with_wins = against_games = against_wins = 0
        heroes: Counter = Counter()
        is_me = False
        for me in my_lines:
            for p in me.match.players:
                if p.name != name:
                    continue
                if p.id == me.id:
                    is_me = True
                    continue
                heroes[p.hero_name] += 1
                if p.team == me.team:
                    with_games += 1
                    with_wins += int(me.is_winner)
                else:
                    against_games += 1
                    against_wins += int(me.is_winner)
        out.append({
            "battletag": tag, "is_me": is_me,
            "with": {"games": with_games, "wins": with_wins},
            "against": {"games": against_games, "wins": against_wins},
            "top_heroes": [h for h, _ in heroes.most_common(3)],
        })
    return out
