import time
from pathlib import Path

from app.live import battlelobby
from app.live.battlelobby import extract_battletags, parse_lobby, resolve_lobby_map
from app.live.session import LiveSession

FIXTURES = Path(__file__).parent / "fixtures"
TOD = {"first_objective_s": 150, "objective_interval_s": 105, "source": "estimation", "samples": 0}


def test_overlay_objective_and_powerspikes():
    s = LiveSession()
    s.on_lobby(["A#1"], "towers_of_doom", "appris", "abc", TOD)
    s.start(None, "valla", clock_s=120)
    s.set_levels(ally=9, enemy=10)
    snap = s.snapshot()
    assert snap["status"] == "in_game" and snap["map_id"] == "towers_of_doom"
    assert 25 <= snap["objective"]["next_in_s"] <= 31
    texts = [a["text"] for a in snap["alerts"]]
    assert "Désavantage de talent : évitez les combats." in texts
    assert "L'équipe adverse atteint le niveau 10." in texts
    assert "Ne forcez pas un combat en infériorité de talent." in snap["tips"]


def test_alerts_never_accumulate():
    s = LiveSession()
    s.on_lobby([], "towers_of_doom", "appris", None, TOD)
    s.start(None, None, clock_s=120)
    for _ in range(50):
        snap = s.snapshot()
    assert len(snap["alerts"]) <= 3
    assert sum(a["id"] == "objective" for a in snap["alerts"]) == 1


def test_flash_alerts_expire(monkeypatch):
    s = LiveSession()
    s.start("dragon_shire", None, 300)
    s.set_levels(ally=10, enemy=None)
    assert any(a["text"] == "Niveau 10 atteint." for a in s.snapshot()["alerts"])
    real = time.monotonic
    monkeypatch.setattr(time, "monotonic", lambda: real() + 60)
    assert not any(a["text"] == "Niveau 10 atteint." for a in s.snapshot()["alerts"])


def test_new_lobby_resets_previous_game():
    s = LiveSession()
    s.start("dragon_shire", "valla", 600)
    s.set_levels(ally=15, enemy=18)
    s.camp_taken("boss", "ally")
    first_game = s.game_id
    s.on_lobby(["B#2"], "braxis_holdout", "appris", "h", None)
    snap = s.snapshot()
    assert snap["game_id"] == first_game + 1 and snap["status"] == "loading"
    assert snap["levels"]["ally"] == 1 and snap["camps"] == [] and snap["alerts"] == []
    assert snap["clock_s"] is None and snap["map_id"] == "braxis_holdout"


def test_game_end_and_process_exit_clear_overlay(monkeypatch):
    s = LiveSession()
    s.on_process(True)
    s.start("dragon_shire", None, 300)
    s.on_game_end()
    assert s.snapshot()["status"] == "ended"
    real = time.monotonic
    monkeypatch.setattr(time, "monotonic", lambda: real() + 60)
    assert s.snapshot()["status"] == "idle"
    s.start("dragon_shire", None, 10)
    s.on_process(False)
    assert s.snapshot()["status"] == "idle" and not s.snapshot()["game_running"]


def test_camp_timer():
    s = LiveSession()
    s.start("dragon_shire", None, clock_s=300)
    s.camp_taken("siege", "ally")
    camp = s.snapshot()["camps"][0]
    assert 175 <= camp["respawn_in_s"] <= 180


def test_real_battlelobby_players_and_map_hash():
    info = parse_lobby((FIXTURES / "storm_league.battlelobby").read_bytes())
    assert len(info.battletags) == 10 and info.battletags[0] == "mumz0rsf#1442"
    assert "blizzmaps#1" not in info.battletags
    assert info.map_hash and info.map_hash.startswith("053e0739")


def test_map_learned_from_finished_game(tmp_path, monkeypatch):
    monkeypatch.setattr(battlelobby, "_learned_path", lambda: tmp_path / "map_hashes.json")
    info = parse_lobby((FIXTURES / "storm_league.battlelobby").read_bytes())
    assert resolve_lobby_map(info).map_id is None  # cache Battle.net absent ici
    battlelobby.learn_map(info.map_hash, "hanamura_temple")
    again = resolve_lobby_map(parse_lobby((FIXTURES / "storm_league.battlelobby").read_bytes()))
    assert again.map_id == "hanamura_temple" and again.map_source == "appris"


def test_battletags_from_lobby_bytes():
    data = b"\x00\x12Azsra#2154\x00\x00Bob#12345\x00Azsra#2154"
    assert extract_battletags(data) == ["Azsra#2154", "Bob#12345"]


def test_estimated_clock_after_loading(monkeypatch):
    s = LiveSession()
    s.on_lobby(["A#1"], "battlefield_of_eternity", "appris", None,
               {"first_objective_s": 150, "objective_interval_s": 125, "source": "mesuré"})
    assert s.snapshot()["status"] == "loading"
    real = time.monotonic
    monkeypatch.setattr(time, "monotonic", lambda: real() + 95)  # 30 s après les portes
    snap = s.snapshot()
    assert snap["status"] == "in_game" and snap["clock_source"] == "estimée"
    assert 28 <= snap["clock_s"] <= 32
    s.sync_clock(40, "écran")  # la lecture d'écran remplace l'estimation
    assert s.snapshot()["clock_source"] == "écran"


def test_lobby_poller_detects_new_file_even_if_folder_recreated(tmp_path):
    import shutil

    from app.live.battlelobby import LobbyWatcher

    seen = []
    w = LobbyWatcher(tmp_path / "Heroes of the Storm", seen.append)
    w.prime()  # dossier absent au démarrage
    folder = tmp_path / "Heroes of the Storm" / "TempWriteReplayP1"
    folder.mkdir(parents=True)
    shutil.copy(FIXTURES / "storm_league.battlelobby", folder / "replay.server.battlelobby")
    assert w.poll() is None  # attend une taille stable
    assert w.poll() is not None and seen[0].battletags[0] == "mumz0rsf#1442"
    assert w.poll() is None  # pas de double détection
    shutil.rmtree(tmp_path / "Heroes of the Storm")  # le jeu supprime le dossier…
    folder.mkdir(parents=True)  # …puis le recrée pour la partie suivante
    shutil.copy(FIXTURES / "storm_league.battlelobby", folder / "replay.server.battlelobby")
    w.poll()
    assert w.poll() is not None and len(seen) == 2
