"""Replays réels (voir fixtures/README.md)."""
from pathlib import Path

from app.analytics.timings import calibrate_map
from app.replay.extractor import extract_match
from app.replay.parser import read_replay

FIXTURES = Path(__file__).parent / "fixtures"


def test_storm_league_replay():
    m = extract_match(read_replay(FIXTURES / "hanamura_storm_league.StormReplay"))
    assert m.map_id == "hanamura_temple" and m.game_mode == "Storm League"
    assert m.duration_s == 967 and len(m.players) == 10
    abathur = m.players[0]
    assert abathur.name == "mumz0rsf" and abathur.hero_id == "abathur" and abathur.role == "Support"
    assert abathur.stat("deaths") == 2 and abathur.stat("hero_damage") == 27655
    assert abathur.talents[0]["name"] == "AbathurReinforcedCarapace"
    assert any(e.kind == "camp" and e.payload["camp"] == "Siege Camp" for e in m.events)
    assert m.events[0].kind == "gates" and m.events[0].t_s == 0


def test_dragon_shire_objectives_on_real_clock():
    m = extract_match(read_replay(FIXTURES / "dragon_shire_ai.StormReplay"))
    knights = [round(e.t_s) for e in m.events if e.kind == "objective" and e.payload["name"] == "DragonKnightActivated"]
    assert knights == [161, 476, 745]


def test_timings_calibrated_from_imported_replays(db):
    from tests.factories import make_raw_replay  # noqa: F401  (assure l'import des modèles)
    from app.models import Match, MatchEvent, Replay

    for i, starts in enumerate(([150, 404], [151, 440], [149, 420])):
        r = Replay(file_path=f"r{i}", file_hash=f"h{i}".ljust(64, "0"), status="parsed")
        db.add(r)
        db.flush()
        m = Match(replay_id=r.id, map_id="battlefield_of_eternity", map_name="BoE", duration_s=900)
        db.add(m)
        db.flush()
        for t in starts:
            db.add(MatchEvent(match_id=m.id, t_s=t, kind="objective", payload={"name": "Boss Duel Started"}))
        db.add(MatchEvent(match_id=m.id, t_s=starts[0] + 130, kind="objective", payload={"name": "Immortal Defeated"}))
    db.commit()
    cal = calibrate_map(db, "battlefield_of_eternity")
    assert cal["first_objective_s"] == 150 and cal["samples"] == 3
    assert 120 <= cal["objective_interval_s"] <= 160
