"""Génère app/data/talents.json depuis heroes-talents (MIT, github.com/heroespatchnotes/heroes-talents).

Usage : python scripts/build_talent_catalog.py <chemin/vers/heroes-talents/hero>
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.reference import registry  # noqa: E402

src = Path(sys.argv[1])
out: dict = {"_meta": {"source": "https://github.com/heroespatchnotes/heroes-talents", "license": "MIT"}, "heroes": {}}
for f in sorted(src.glob("*.json")):
    d = json.loads(f.read_text(encoding="utf-8"))
    hero = registry().resolve_hero(d["name"]) or registry().resolve_hero(d.get("cUnitId", ""))
    if not hero:
        print("héros non reconnu :", d["name"])
        continue
    talents = {}
    for level, items in d["talents"].items():
        talents[level] = [
            {"id": t["talentTreeId"], "name": t["name"], "sort": t["sort"],
             "description": re.sub(r"\s+", " ", t.get("description", "")).strip()[:280]}
            for t in sorted(items, key=lambda t: t["sort"])
        ]
    out["heroes"][hero.id] = {
        "name": d["name"], "role": d.get("expandedRole"), "attribute_id": d.get("attributeId"),
        "unit_id": d.get("cUnitId"), "slug": d.get("hyperlinkId"), "talents": talents,
    }
dest = Path(__file__).resolve().parents[1] / "app" / "data" / "talents.json"
dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"{len(out['heroes'])} héros -> {dest} ({dest.stat().st_size // 1024} Ko)")
