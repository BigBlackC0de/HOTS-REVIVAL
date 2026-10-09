from app.replay.extractor import extract_match
from tests.factories import make_raw_replay


def test_extract_basic_fields():
    m = extract_match(make_raw_replay())
    assert m.map_id == "towers_of_doom"
    assert m.map_name == "Towers of Doom"
    assert m.game_mode == "Storm League"
    assert m.duration_s == 825
    assert m.winner_team == 1
    assert len(m.players) == 10


def test_players_and_stats():
    m = extract_match(make_raw_replay())
    me = m.players[1]
    assert me.toon_handle == "2-Hero-1-1278570"
    assert me.hero_id == "valla" and me.role == "Ranged Assassin"
    assert me.stat("deaths") == 5
    assert me.stat("time_spent_dead_s") == 158
    assert me.talents[0] == {"tier": 1, "level": 1, "name": "DemonHunterHotPursuit"}
    assert m.players[5].hero_id == "etc"


def test_events():
    m = extract_match(make_raw_replay())
    kinds = [e.kind for e in m.events]
    assert kinds.count("death") == 3
    death = next(e for e in m.events if e.kind == "death")
    assert death.slot == 1 and death.payload["killers"] == [5, 7]
    camp = next(e for e in m.events if e.kind == "camp")
    assert camp.team == 0 and camp.payload["camp"] == "Siege Camp"
    assert m.team_levels == {0: 10, 1: 10}


def test_official_protocol_loads_without_imp():
    from app.replay.protocol import available_builds, load_protocol

    proto = load_protocol()
    assert hasattr(proto, "decode_replay_tracker_events")
    assert load_protocol(available_builds()[-1] + 1000) is proto  # build inconnu -> le plus proche
