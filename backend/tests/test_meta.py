from app.draft.engine import MetaData, analyze_draft
from app.meta import service
from app.meta.icyveins import parse_hero_guide, parse_tier_list

TIER_HEADINGS = """
<h2>Free Hero Rotation</h2><a href="/heroes/valla-build-guide">Valla</a>
<h3>Tanks</h3>
<h4>S Tier</h4><span id="ranking-muradin">Muradin</span><span id="ranking-e-t-c">ETC</span>
<h4>B Tier</h4><span id="ranking-johanna">Johanna</span>
<h3>Ranged Assassins</h3>
<h4>A Tier</h4><span id="ranking-valla">Valla</span><span id="ranking-li-ming">Li-Ming</span>
<h4>D Tier</h4><span id="ranking-the-lost-vikings">TLV</span>
"""

TIER_CLASSES = """
<div class="htl_tier_s"><span id="ranking-anub-arak"></span><span id="ranking-lt-morales"></span></div>
<div class="htl_tier_c"><span id="ranking-kel-thuzad"></span></div>
"""

GUIDE = """
<img class="hero_portrait hero_portrait_good" data-heroes-tooltip="hero-tyrande">
<img class="hero_portrait hero_portrait_good" data-heroes-tooltip="hero-abathur">
<img class="hero_portrait hero_portrait_bad" data-heroes-tooltip="hero-anub-arak">
<h3 class="toc_no_parsing">Hungering Arrow Build</h3>
<div class="heroes_build_talents">
  <span class="heroes_build_talent_tier_visual"><span></span><span class="heroes_build_talent_tier_yes"></span><span></span></span>
  <span class="heroes_build_talent_tier_visual"><span class="heroes_build_talent_tier_yes"></span><span></span><span></span></span>
</div>
"""


def test_tier_list_with_headings():
    entries = {e.hero_id: (e.tier, e.role) for e in parse_tier_list(TIER_HEADINGS)}
    assert entries["muradin"] == ("S", "Tank") and entries["etc"][0] == "S"
    assert entries["johanna"][0] == "B" and entries["valla"] == ("A", "Ranged Assassin")
    assert entries["liming"][0] == "A" and entries["lostvikings"][0] == "D"


def test_tier_list_with_classes():
    entries = {e.hero_id: e.tier for e in parse_tier_list(TIER_CLASSES)}
    assert entries == {"anubarak": "S", "ltmorales": "S", "kelthuzad": "C"}


def test_hero_guide():
    g = parse_hero_guide(GUIDE, "valla")
    assert g.synergies == ["tyrande", "abathur"] and g.counters == ["anubarak"]
    build = g.builds[0]
    assert build["title"] == "Hungering Arrow Build"
    assert build["talents"][0]["level"] == 1 and build["talents"][0]["position"] == 2
    assert build["talents"][1]["name"] == "Arsenal"  # niveau 4, 1er talent


def test_ingest_rejects_unreadable_page(db):
    assert service.ingest(db, "tierlist", "general", "u", "<html>Cloudflare</html>")["ok"] is False
    assert service.ingest(db, "guide", "valla", "u", GUIDE)["ok"] is True
    assert service.hero_guide(db, "valla")["synergies"][0]["hero"] == "Tyrande"
    combos = service.best_combos(db)
    assert {h["hero_id"] for h in combos[0]["heroes"]} in ({"valla", "tyrande"}, {"valla", "abathur"})
    assert all(p["kind"] in ("tierlist", "guide") for p in service.pending(db))


def test_draft_uses_icy_veins_meta():
    meta = MetaData(tiers={"cassia": "S"}, synergies={"valla": ["tyrande"]}, countered_by={"valla": ["anubarak"]})
    res = analyze_draft(["valla", "tyrande"], ["anubarak"], meta=meta, top_n=90)
    assert any("Valla + Tyrande" in s or "Tyrande + Valla" in s for s in res.synergies)
    assert any("Valla est contré par Anub'arak" in t for t in res.threats)
    assert next(r for r in res.recommendations if r["hero_id"] == "cassia")["tier"] == "S"
