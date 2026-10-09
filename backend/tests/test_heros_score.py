from app.analytics.heros_score import compute_heros_score, scale
from app.replay.extractor import extract_match
from tests.factories import make_raw_replay


def test_scale_bounds():
    assert scale(0, 0, 10) == 0
    assert scale(10, 0, 10) == 100
    assert scale(5, 10, 0) == 50  # sens inversé
    assert scale(99, 0, 10) == 100


def test_score_range_and_survival_penalty():
    m = extract_match(make_raw_replay(me_deaths=5))
    me = m.players[1]
    team = [p for p in m.players if p.team == me.team]
    res = compute_heros_score(me, team, m.duration_s, draft_score=60)
    for value in res.as_dict().values():
        assert 0 <= value <= 100
    assert res.draft == 60
    good = extract_match(make_raw_replay(me_deaths=1)).players[1]
    good.stats["time_spent_dead_s"] = 20
    res_good = compute_heros_score(good, team, m.duration_s, draft_score=60)
    assert res_good.survival > res.survival
    assert "deaths_per_10min" in res.details["survival"]


def test_role_balance_suggests_second_role():
    from app.coach.roles import role_balance, role_context

    by_role = {"Healer": {"games": 18}, "Tank": {"games": 2}}
    out = role_balance(by_role)
    assert out["main_role"] == "Healer" and "second rôle" in out["advice"]
    assert role_balance({"Healer": {"games": 5}, "Tank": {"games": 5}})["advice"] is None
    assert "normale" in role_context("Healer")["normal"]
