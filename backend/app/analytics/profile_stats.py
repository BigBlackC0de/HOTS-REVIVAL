"""Profil joueur : winrates, tendances, meilleurs / pires héros, rôles."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Match, MatchPlayer

PRIOR_GAMES = 6  # lissage bayésien vers 50 % pour les petits échantillons
MIN_GAMES = 3


def smoothed_winrate(wins: int, games: int) -> float:
    return (wins + PRIOR_GAMES * 0.5) / (games + PRIOR_GAMES)


@dataclass
class Bucket:
    games: int = 0
    wins: int = 0
    score_sum: float = 0.0
    scored: int = 0

    def add(self, win: bool, score: int | None) -> None:
        self.games += 1
        self.wins += int(win)
        if score is not None:
            self.score_sum += score
            self.scored += 1

    def as_dict(self) -> dict:
        return {
            "games": self.games,
            "wins": self.wins,
            "winrate": round(self.wins / self.games, 3) if self.games else None,
            "smoothed_winrate": round(smoothed_winrate(self.wins, self.games), 3),
            "avg_heros_score": round(self.score_sum / self.scored, 1) if self.scored else None,
        }


@dataclass
class ProfileSummary:
    total: dict
    by_role: dict[str, dict]
    by_hero: dict[str, dict]
    best_hero: str | None
    worst_hero: str | None
    main_role: str | None
    secondary_role: str | None
    heroes_to_avoid: list[str]
    trend: dict
    category_averages: dict[str, float] = field(default_factory=dict)


def my_match_lines(db: Session, limit: int | None = None) -> list[MatchPlayer]:
    stmt = (
        select(MatchPlayer)
        .join(Match)
        .where(MatchPlayer.is_me.is_(True))
        .options(selectinload(MatchPlayer.score), selectinload(MatchPlayer.match))
        .order_by(Match.played_at.desc().nullslast(), Match.id.desc())
    )
    if limit:
        stmt = stmt.limit(limit)
    return list(db.scalars(stmt))


def build_profile(db: Session) -> ProfileSummary:
    lines = my_match_lines(db)
    total, by_role, by_hero = Bucket(), defaultdict(Bucket), defaultdict(Bucket)
    hero_names: dict[str, str] = {}
    cat_sum: dict[str, float] = defaultdict(float)
    cat_n = 0

    for mp in lines:
        score = mp.score.overall if mp.score else None
        total.add(mp.is_winner, score)
        by_role[mp.role or "Inconnu"].add(mp.is_winner, score)
        by_hero[mp.hero_id].add(mp.is_winner, score)
        hero_names[mp.hero_id] = mp.hero_name
        if mp.score:
            cat_n += 1
            for c in ("placement", "macro", "teamfight", "objectives", "survival", "draft"):
                cat_sum[c] += getattr(mp.score, c)

    eligible = {h: b for h, b in by_hero.items() if b.games >= MIN_GAMES}
    ranked = sorted(eligible, key=lambda h: smoothed_winrate(eligible[h].wins, eligible[h].games))
    roles_sorted = sorted(by_role, key=lambda r: by_role[r].games, reverse=True)

    recent, previous = lines[:10], lines[10:20]

    def wr(ls: list[MatchPlayer]) -> float | None:
        return round(sum(m.is_winner for m in ls) / len(ls), 3) if ls else None

    trend = {"last_10_winrate": wr(recent), "previous_10_winrate": wr(previous)}
    if trend["last_10_winrate"] is not None and trend["previous_10_winrate"] is not None:
        delta = trend["last_10_winrate"] - trend["previous_10_winrate"]
        trend["direction"] = "up" if delta > 0.05 else "down" if delta < -0.05 else "stable"
    else:
        trend["direction"] = "unknown"

    return ProfileSummary(
        total=total.as_dict(),
        by_role={r: b.as_dict() for r, b in by_role.items()},
        by_hero={h: {**b.as_dict(), "hero": hero_names[h]} for h, b in by_hero.items()},
        best_hero=hero_names[ranked[-1]] if ranked else None,
        worst_hero=hero_names[ranked[0]] if len(ranked) > 1 else None,
        main_role=roles_sorted[0] if roles_sorted else None,
        secondary_role=roles_sorted[1] if len(roles_sorted) > 1 else None,
        heroes_to_avoid=[
            hero_names[h] for h in ranked if smoothed_winrate(eligible[h].wins, eligible[h].games) < 0.45
        ],
        trend=trend,
        category_averages={c: round(v / cat_n, 1) for c, v in cat_sum.items()} if cat_n else {},
    )


def progression(db: Session) -> list[dict]:
    """Série chronologique : HEROS SCORE et winrate glissant (10 parties)."""
    lines = list(reversed(my_match_lines(db)))
    out, window = [], []
    for mp in lines:
        window = (window + [mp.is_winner])[-10:]
        out.append({
            "match_id": mp.match_id,
            "played_at": mp.match.played_at.isoformat() if mp.match.played_at else None,
            "hero": mp.hero_name,
            "win": mp.is_winner,
            "heros_score": mp.score.overall if mp.score else None,
            "rolling_winrate": round(sum(window) / len(window), 3),
        })
    return out


def talent_stats(db: Session, hero_id: str) -> list[dict]:
    """Taux de victoire / popularité des talents d'un héros sur l'ensemble des
    joueurs présents dans les replays importés (données publiques post-partie)."""
    rows = db.scalars(select(MatchPlayer).where(MatchPlayer.hero_id == hero_id))
    tiers: dict[int, dict[str, Bucket]] = defaultdict(lambda: defaultdict(Bucket))
    tier_games: dict[int, int] = defaultdict(int)
    for mp in rows:
        for t in mp.talents or []:
            tiers[t["tier"]][t["name"]].add(mp.is_winner, None)
            tier_games[t["tier"]] += 1
    out = []
    for tier in sorted(tiers):
        options = []
        for name, b in tiers[tier].items():
            options.append({
                "talent": name, "games": b.games,
                "winrate": round(b.wins / b.games, 3),
                "popularity": round(b.games / tier_games[tier], 3),
                "smoothed_winrate": round(smoothed_winrate(b.wins, b.games), 3),
            })
        options.sort(key=lambda o: o["smoothed_winrate"], reverse=True)
        out.append({"tier": tier, "level": (1, 4, 7, 10, 13, 16, 20)[tier - 1], "options": options})
    return out
