from app.live.battlelobby import extract_battletags
from app.live.session import LiveSession


def test_overlay_objective_and_powerspikes():
    s = LiveSession()
    s.start("towers_of_doom", "valla", clock_s=120)
    s.set_levels(ally=9, enemy=10)
    snap = s.snapshot()
    assert snap["status"] == "in_game"
    assert 25 <= snap["objective"]["next_in_s"] <= 31  # 150 - 120
    assert snap["objective"]["priority"] == "Regroupement pour l'objectif"
    assert any(a["text"] == "L'équipe adverse possède un avantage de talent." for a in snap["alerts"])
    assert "Ne forcez pas un combat en infériorité de talent." in snap["tips"]


def test_camp_timer_and_reset():
    s = LiveSession()
    s.start("dragon_shire", None, clock_s=300)
    s.camp_taken("siege", "ally")
    camp = s.snapshot()["camps"][0]
    assert 175 <= camp["respawn_in_s"] <= 180
    s.stop()
    assert s.snapshot()["status"] == "idle"


def test_battletags_from_lobby_bytes():
    data = b"\x00\x12Azsra#2154\x00\x00Bob#12345\x00Azsra#2154"
    assert extract_battletags(data) == ["Azsra#2154", "Bob#12345"]
