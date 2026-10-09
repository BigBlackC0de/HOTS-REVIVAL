import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.replay import importer
from tests.factories import make_raw_replay


@pytest.fixture()
def client(db, tmp_path, monkeypatch):
    replay = tmp_path / "2026-10-08 21.14.02 Tours du Destin.StormReplay"
    replay.write_bytes(b"fake-replay-content")
    monkeypatch.setattr(importer, "read_replay", lambda path: make_raw_replay())
    monkeypatch.setattr("app.main.init_engine", lambda url: None)
    settings = Settings(database_url="sqlite://", replay_dir=str(tmp_path), watch_replays=False,
                        watch_live=False, player_toon_handle="2-Hero-1-1278570", anthropic_api_key="")
    with TestClient(create_app(settings, start_watchers=False)) as c:
        yield c


def test_import_and_query(client):
    r = client.post("/api/replays/import", json={})
    assert r.status_code == 200, r.text
    assert r.json()["imported"] == 1
    assert client.post("/api/replays/import", json={}).json()["duplicates"] == 1

    matches = client.get("/api/matches").json()
    assert len(matches) == 1 and matches[0]["me"]["hero_id"] == "valla"
    match_id = matches[0]["id"]

    detail = client.get(f"/api/matches/{match_id}").json()
    assert len(detail["players"]) == 10
    assert detail["me"]["score"]["overall"] > 0

    report = client.get(f"/api/matches/{match_id}/report").json()
    assert report["facts"]["headline"].startswith("Partie perdue à 13:45 sur Towers of Doom")
    assert "5 morts." in report["facts"]["weaknesses"]

    ai = client.post(f"/api/matches/{match_id}/report/ai").json()
    assert ai["model"] == "deterministic" and ai["ai_summary"]["summary"]

    profile = client.get("/api/profile").json()
    assert profile["total"]["games"] == 1 and profile["main_role"] == "Ranged Assassin"
    assert client.get("/api/profile/progression").json()[0]["hero"] == "Valla"

    talents = client.get("/api/talents/valla").json()
    assert talents["tiers"][0]["options"][0]["talent"] == "DemonHunterHotPursuit"


def test_draft_endpoint(client):
    r = client.post("/api/draft/analyze", json={"allies": ["Valla"], "enemies": ["E.T.C.", "Jaina"]})
    assert r.status_code == 200
    assert r.json()["recommendations"]


def test_coach_without_key_streams_fallback(client):
    with client.stream("POST", "/api/coach/chat", json={"message": "Pourquoi ai-je perdu ?"}) as r:
        body = "".join(r.iter_text())
    assert "event: start" in body and "ANTHROPIC_API_KEY" in body and "event: done" in body


def test_live_endpoints(client):
    assert client.post("/api/live/start", json={"map_id": "braxis_holdout", "my_hero_id": "valla"}).status_code == 200
    assert client.post("/api/live/levels", json={"ally_delta": 1}).json()["levels"]["ally"] == 2
    assert client.post("/api/live/camp", json={"camp_type": "boss"}).json()["camps"][0]["camp"] == "boss"
    assert client.post("/api/live/stop").json()["status"] == "idle"
    assert client.get("/api/compliance").json()["forbidden"]


def test_settings_roundtrip(client, tmp_path):
    s = client.get("/api/settings").json()
    assert s["has_api_key"] is False and s["replay_dir_exists"] is True
    assert client.put("/api/settings", json={"replay_dir": str(tmp_path / "absent")}).status_code == 400
    r = client.put("/api/settings", json={"player_battletag": "Azsra#2154", "anthropic_api_key": "sk-test"})
    body = r.json()
    assert body["player_battletag"] == "Azsra#2154" and body["has_api_key"] is True
    assert "sk-test" not in r.text  # la clé n'est jamais renvoyée
    assert client.get("/api/coach/status").json()["available"] is True


def test_rank_history(client):
    assert client.post("/api/profile/ranks", json={"league": "Inconnue"}).status_code == 400
    assert client.post("/api/profile/ranks", json={"league": "Platine", "division": 3}).json()["label"] == "Platine 3"
    client.post("/api/profile/ranks", json={"league": "Diamant", "division": 5})
    hist = client.get("/api/profile/ranks").json()["history"]
    assert [h["label"] for h in hist] == ["Diamant 5", "Platine 3"]
    assert client.get("/api/profile").json()["player"]["rank"] == "Diamant 5"


def test_all_region_folders_are_imported(tmp_path):
    from app.config import Settings

    accounts = tmp_path / "Accounts" / "137044993"
    eu = accounts / "2-Hero-1-1278570" / "Replays" / "Multiplayer"
    us = accounts / "1-Hero-1-555" / "Replays" / "Multiplayer"
    eu.mkdir(parents=True)
    us.mkdir(parents=True)
    s = Settings(replay_dir=str(eu), anthropic_api_key="")
    assert set(s.resolved_replay_dirs()) == {eu, us}
    assert set(s.resolved_toon_handles()) == {"2-Hero-1-1278570", "1-Hero-1-555"}


def test_reanalyze_keeps_ai_summaries(client):
    client.post("/api/replays/import", json={})
    match_id = client.get("/api/matches").json()[0]["id"]
    client.post(f"/api/matches/{match_id}/report/ai")
    res = client.post("/api/replays/reanalyze").json()
    assert res == {"reanalyzed": 1, "kept_ai_summaries": 1}
    new_id = client.get("/api/matches").json()[0]["id"]
    assert client.get(f"/api/matches/{new_id}/report").json()["ai_summary"]["summary"]


def test_key_moments_sorted_by_time():
    from app.analytics.report import fmt_clock

    moments = ["20:56 – b", "6:39 – a", "13:53 – c"]
    moments.sort(key=lambda t: int(t.split(" ")[0].split(":")[0]) * 60 + int(t.split(" ")[0].split(":")[1]))
    assert moments[0].startswith("6:39") and fmt_clock(399) == "6:39"
