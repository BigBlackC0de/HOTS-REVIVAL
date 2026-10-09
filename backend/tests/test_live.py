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
    s.set_levels(ally=9, enemy=9)  # première saisie : référence, rien d'annoncé
    s.set_levels(ally=None, enemy=10)
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
    s.set_levels(ally=9, enemy=None)
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


def test_game_already_in_progress_is_resumed(tmp_path):
    import os
    import shutil

    from app.live.battlelobby import LobbyWatcher

    folder = tmp_path / "Heroes of the Storm" / "TempWriteReplayP1"
    folder.mkdir(parents=True)
    lobby = folder / "replay.server.battlelobby"
    shutil.copy(FIXTURES / "storm_league.battlelobby", lobby)
    old = time.time() - 300  # partie lancée il y a 5 minutes
    os.utime(lobby, (old, old))
    w = LobbyWatcher(tmp_path / "Heroes of the Storm", lambda info: None)
    w.prime()
    assert w.poll() is None  # le démarrage normal l'ignore…
    info = w.in_progress()
    assert info and 290 <= info.age_s <= 320  # …mais la reprise la retrouve
    assert w.in_progress(ended_after=time.time()) is None  # un replay plus récent = partie finie

    s = LiveSession()
    s.on_lobby(info.battletags, "hanamura_temple", "appris", info.map_hash, None, info.age_s)
    snap = s.snapshot()
    assert snap["status"] == "in_game" and snap["clock_source"] == "estimée"
    assert 230 <= snap["clock_s"] <= 250  # 300 s depuis le chargement - 65 s


def test_levels_estimated_from_xp_curve_until_real_reading(monkeypatch):
    from app.analytics.timings import DEFAULT_LEVEL_CURVE

    s = LiveSession()
    s.start("dragon_shire", None, 400, {"first_objective_s": 75, "objective_interval_s": 180,
                                        "level_curve": DEFAULT_LEVEL_CURVE})
    snap = s.snapshot()
    assert snap["levels"]["source"] == "estimée" and snap["levels"]["ally"] == 10  # 10 à 396 s
    assert not any(a["id"] == "talent-disadvantage" for a in snap["alerts"])
    s.set_levels(ally=None, enemy=13, source="écran")  # vraie lecture : on quitte l'estimation
    snap = s.snapshot()
    assert snap["levels"]["source"] == "écran" and snap["levels"]["ally"] == 10 and snap["levels"]["enemy"] == 13
    assert any(a["id"] == "talent-disadvantage" for a in snap["alerts"])


def test_player_level_curve_from_replays(db):
    from app.analytics.timings import DEFAULT_LEVEL_CURVE, level_curve
    from app.models import Match, MatchEvent, Replay

    assert level_curve(db) == DEFAULT_LEVEL_CURVE  # pas assez de parties
    for i in range(5):
        r = Replay(file_path=f"r{i}", file_hash=f"x{i}".ljust(64, "0"), status="parsed")
        db.add(r)
        db.flush()
        m = Match(replay_id=r.id, map_id="dragon_shire", map_name="DS", duration_s=900, game_mode="Storm League")
        db.add(m)
        db.flush()
        for lvl, t in ((4, 120 + i), (10, 380 + i)):
            db.add(MatchEvent(match_id=m.id, t_s=t, kind="level", team=0, payload={"level": lvl}))
    db.commit()
    assert level_curve(db) == {4: 122, 10: 382}


def test_estimates_are_never_spoken():
    from app.analytics.timings import DEFAULT_LEVEL_CURVE

    s = LiveSession()
    s.start("dragon_shire", None, 380, {"level_curve": DEFAULT_LEVEL_CURVE, "first_objective_s": 400,
                                        "objective_interval_s": 180})
    s.clock_source = "estimée"  # horloge devinée depuis le chargement
    alerts = s.snapshot()["alerts"]
    assert not any(a["id"].startswith("tier-") for a in alerts)  # plus de « niveau X dans ≈ N s »
    assert alerts and all(a["voice"] is False for a in alerts)  # objectif affiché mais pas annoncé
    s.sync_clock(382, "écran")
    assert all(a["voice"] for a in s.snapshot()["alerts"])


def test_screen_levels_first_reading_is_silent_and_filtered():
    from app.analytics.timings import DEFAULT_LEVEL_CURVE

    s = LiveSession()
    s.start("dragon_shire", None, 0, {"level_curve": DEFAULT_LEVEL_CURVE})
    s.sync_clock(400, "écran")  # niveau ~10 attendu
    s.set_levels(ally=1, enemy=None, source="écran")  # erreur d'OCR invraisemblable : ignorée
    assert s.snapshot()["levels"]["source"] == "estimée"
    s.set_levels(ally=9, enemy=10, source="écran")  # première vraie lecture : rien d'annoncé
    snap = s.snapshot()
    assert snap["levels"]["ally"] == 9 and snap["levels"]["enemy"] == 10
    assert not any(a["id"].startswith(("ally-", "enemy-")) for a in snap["alerts"])
    s.set_levels(ally=10, enemy=None, source="écran")
    alerts = {a["id"]: a for a in s.snapshot()["alerts"]}
    assert alerts["ally-10"]["voice"] and alerts["ally-10"]["text"] == "Niveau 10 atteint."
