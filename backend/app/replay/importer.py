"""Import d'un replay : parsing -> base de données -> HEROS SCORE -> rapport."""
from __future__ import annotations

import logging
from collections.abc import Collection
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analytics.heros_score import compute_heros_score
from app.analytics.report import build_facts
from app.draft.engine import analyze_draft
from app.models import HerosScore, Match, MatchEvent, MatchPlayer, Player, Replay, Report
from app.replay.extractor import ParsedMatch, extract_match
from app.replay.parser import file_sha256, read_replay

log = logging.getLogger(__name__)


@dataclass
class ImportResult:
    status: str  # imported|duplicate|failed
    replay_id: int | None = None
    match_id: int | None = None
    error: str | None = None


def import_replay_file(db: Session, path: Path, me_toons: Collection[str] | str | None) -> ImportResult:
    digest = file_sha256(path)
    existing = db.scalar(select(Replay).where(Replay.file_hash == digest))
    if existing:
        match_id = existing.match.id if existing.match else None
        return ImportResult("duplicate", existing.id, match_id)

    replay = Replay(file_path=str(path), file_hash=digest)
    db.add(replay)
    db.flush()
    try:
        parsed = extract_match(read_replay(path))
    except Exception as exc:  # replay corrompu, build inconnu…
        log.exception("Échec du parsing de %s", path)
        replay.status, replay.error = "failed", f"{type(exc).__name__}: {exc}"
        db.commit()
        return ImportResult("failed", replay.id, error=replay.error)

    match = persist_match(db, replay, parsed, me_toons)
    replay.status = "parsed"
    db.commit()
    return ImportResult("imported", replay.id, match.id)


def _upsert_player(db: Session, toon: str | None, name: str, is_me: bool) -> Player | None:
    if not toon:
        return None
    player = db.scalar(select(Player).where(Player.toon_handle == toon))
    if player is None:
        region = int(toon.split("-")[0]) if toon.split("-")[0].isdigit() else None
        player = Player(toon_handle=toon, name=name, region=region, is_me=is_me)
        db.add(player)
        db.flush()
    else:
        player.name = name
        player.is_me = player.is_me or is_me
    return player


def persist_match(db: Session, replay: Replay, parsed: ParsedMatch, me_toons: Collection[str] | str | None) -> Match:
    if isinstance(me_toons, str):
        me_toons = {me_toons}
    me_set = set(me_toons or ())
    match = Match(
        replay_id=replay.id,
        map_id=parsed.map_id,
        map_name=parsed.map_name,
        game_mode=parsed.game_mode,
        game_version=parsed.game_version,
        played_at=parsed.played_at,
        duration_s=parsed.duration_s,
        winner_team=parsed.winner_team,
        team_levels={str(k): v for k, v in parsed.team_levels.items()},
    )
    db.add(match)
    db.flush()

    rows: list[MatchPlayer] = []
    for p in parsed.players:
        is_me = bool(p.toon_handle and p.toon_handle in me_set)
        player = _upsert_player(db, p.toon_handle, p.name, is_me)
        mp = MatchPlayer(
            match_id=match.id, player_id=player.id if player else None, slot=p.slot, team=p.team,
            is_winner=p.is_winner, is_me=is_me, name=p.name, toon_handle=p.toon_handle,
            hero_id=p.hero_id, hero_name=p.hero_name, role=p.role,
            kills=p.stat("kills"), deaths=p.stat("deaths"), assists=p.stat("assists"),
            takedowns=p.stat("takedowns"), hero_damage=p.stat("hero_damage"),
            siege_damage=p.stat("siege_damage"), healing=p.stat("healing"),
            self_healing=p.stat("self_healing"), damage_taken=p.stat("damage_taken"),
            xp_contribution=p.stat("xp_contribution"), merc_camp_captures=p.stat("merc_camp_captures"),
            time_spent_dead_s=p.stat("time_spent_dead_s"), stats=p.stats, talents=p.talents,
        )
        db.add(mp)
        rows.append(mp)

    for e in parsed.events:
        db.add(MatchEvent(match_id=match.id, t_s=e.t_s, kind=e.kind, team=e.team, slot=e.slot, payload=e.payload))
    db.flush()

    # HEROS SCORE pour les 10 joueurs (sert aussi de référentiel comparatif)
    draft_scores = {}
    for team in (0, 1):
        allies = [p.hero_id for p in parsed.players if p.team == team]
        enemies = [p.hero_id for p in parsed.players if p.team != team]
        draft_scores[team] = analyze_draft(allies, enemies, parsed.map_id).composition_score
    for mp, p in zip(rows, parsed.players):
        team = [q for q in parsed.players if q.team == p.team]
        res = compute_heros_score(p, team, parsed.duration_s, draft_scores[p.team])
        db.add(HerosScore(match_player_id=mp.id, **res.as_dict(), algo_version=res.algo_version, details=res.details))
    db.flush()

    db.refresh(match)
    for mp in rows:
        if mp.is_me:
            db.refresh(mp)
            db.add(Report(match_id=match.id, match_player_id=mp.id, facts=build_facts(match, mp)))
    return match
