from app.draft.engine import analyze_draft


def test_combo_threat_detected():
    res = analyze_draft(["Valla", "Uther"], ["E.T.C.", "Jaina"])
    assert any("E.T.C. + Jaina" in t for t in res.threats)


def test_recommendations_fill_missing_roles():
    res = analyze_draft(["Valla", "Jaina", "Raynor"], ["Muradin", "Illidan"])
    assert res.recommendations
    roles = {r["role"] for r in res.recommendations[:3]}
    assert roles & {"Tank", "Healer"}
    assert any("meilleur choix" in c for c in res.counters)
    assert any("Pas de tank" in w for w in res.weaknesses)


def test_personal_winrate_influences_ranking():
    base = analyze_draft(["Valla"], [], personal_winrates=None, top_n=90)
    boosted = analyze_draft(["Valla"], [], personal_winrates={"cassia": 0.9}, top_n=90)
    rank = lambda r: [x["hero_id"] for x in r.recommendations].index("cassia")  # noqa: E731
    assert rank(boosted) < rank(base)


def test_phases_and_unknown():
    res = analyze_draft(["Gazlowe", "Murky"], ["Nazeebo", "The Butcher", "Inconnu"])
    assert res.phases["early"] > res.phases["late"]
    assert res.unknown_heroes == ["Inconnu"]
