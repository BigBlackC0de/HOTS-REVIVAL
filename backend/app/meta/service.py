"""Méta (Icy Veins) : stockage, fraîcheur et accès."""
from __future__ import annotations

import logging
from dataclasses import asdict
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.meta.icyveins import (
    TIER_LISTS, guide_url, parse_hero_guide, parse_tier_list, tier_slugs, updated_label,
)
from app.models import MetaHeroGuide, MetaTierList
from app.reference import registry

log = logging.getLogger(__name__)
TIER_LIST_TTL = timedelta(hours=24)
GUIDE_TTL = timedelta(days=7)
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/130.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _stale(fetched_at: datetime | None, ttl: timedelta) -> bool:
    if fetched_at is None:
        return True
    if fetched_at.tzinfo is None:
        fetched_at = fetched_at.replace(tzinfo=timezone.utc)
    return _now() - fetched_at > ttl


def _slugs(db: Session) -> dict[str, str]:
    slugs: dict[str, str] = {}
    for tl in db.scalars(select(MetaTierList)):
        slugs.update(tl.slugs or {})
    return slugs


def default_slug(hero_id: str) -> str:
    import re

    name = registry().heroes[hero_id].name.lower().replace("ú", "u")
    return re.sub(r"[^a-z0-9]+", "-", name).strip("-")


def pending(db: Session, force: bool = False) -> list[dict]:
    """Pages à (re)télécharger : tier lists périmées puis guides périmés."""
    lists = {tl.list_key: tl for tl in db.scalars(select(MetaTierList))}
    out = [
        {"kind": "tierlist", "key": key, "url": cfg["url"]}
        for key, cfg in TIER_LISTS.items()
        if force or _stale(lists[key].fetched_at if key in lists else None, TIER_LIST_TTL)
    ]
    guides = {g.hero_id: g for g in db.scalars(select(MetaHeroGuide))}
    slugs = _slugs(db)
    for hero_id in registry().heroes:
        g = guides.get(hero_id)
        if force or _stale(g.fetched_at if g else None, GUIDE_TTL):
            out.append({"kind": "guide", "key": hero_id, "url": guide_url(slugs.get(hero_id, default_slug(hero_id)))})
    return out


def ingest(db: Session, kind: str, key: str, url: str, html: str) -> dict:
    """Analyse et enregistre une page. Une page illisible ne remplace jamais des données valides."""
    if kind == "tierlist":
        if key not in TIER_LISTS:
            return {"ok": False, "error": "liste inconnue"}
        entries = parse_tier_list(html)
        if len(entries) < 20:
            return {"ok": False, "error": f"tier list illisible ({len(entries)} héros reconnus)"}
        tl = db.scalar(select(MetaTierList).where(MetaTierList.list_key == key)) or MetaTierList(list_key=key)
        tl.title, tl.url = TIER_LISTS[key]["title"], url
        tl.updated_label = updated_label(html)
        tl.entries = [asdict(e) for e in entries]
        tl.slugs = tier_slugs(html)
        tl.fetched_at = _now()
        db.add(tl)
        db.commit()
        return {"ok": True, "heroes": len(entries)}
    if kind == "guide":
        if key not in registry().heroes:
            return {"ok": False, "error": "héros inconnu"}
        guide = parse_hero_guide(html, key)
        if not (guide.builds or guide.synergies or guide.counters):
            return {"ok": False, "error": "guide illisible"}
        g = db.scalar(select(MetaHeroGuide).where(MetaHeroGuide.hero_id == key)) or MetaHeroGuide(hero_id=key)
        g.url, g.synergies, g.counters, g.builds = url, guide.synergies, guide.counters, guide.builds
        g.fetched_at = _now()
        db.add(g)
        db.commit()
        return {"ok": True, "builds": len(guide.builds), "synergies": len(guide.synergies)}
    return {"ok": False, "error": "type inconnu"}


def refresh_direct(db: Session, force: bool = False, limit: int | None = None) -> dict:
    """Repli sans navigateur : téléchargement direct (peut être bloqué par la protection du site)."""
    done, errors = 0, []
    with httpx.Client(headers=BROWSER_HEADERS, timeout=20, follow_redirects=True) as client:
        for page in pending(db, force)[:limit]:
            try:
                res = client.get(page["url"])
                res.raise_for_status()
                result = ingest(db, page["kind"], page["key"], page["url"], res.text)
            except httpx.HTTPError as exc:
                result = {"ok": False, "error": str(exc)}
            if result["ok"]:
                done += 1
            else:
                errors.append({**page, "error": result["error"]})
    return {"updated": done, "errors": errors[:10]}


# ---- lecture -----------------------------------------------------------------------------

def tier_lists(db: Session) -> list[dict]:
    out = []
    by_key = {tl.list_key: tl for tl in db.scalars(select(MetaTierList))}
    for key, cfg in TIER_LISTS.items():
        tl = by_key.get(key)
        out.append({
            "key": key, "title": cfg["title"], "url": cfg["url"],
            "updated_label": tl.updated_label if tl else None,
            "fetched_at": tl.fetched_at.isoformat() if tl else None,
            "entries": [
                {**e, "hero": registry().heroes[e["hero_id"]].name}
                for e in (tl.entries if tl else []) if e["hero_id"] in registry().heroes
            ],
        })
    return out


def tier_of(db: Session, hero_id: str, list_key: str = "general") -> str | None:
    tl = db.scalar(select(MetaTierList).where(MetaTierList.list_key == list_key))
    for e in (tl.entries if tl else []):
        if e["hero_id"] == hero_id:
            return e["tier"]
    return None


def all_tiers(db: Session, list_key: str = "general") -> dict[str, str]:
    tl = db.scalar(select(MetaTierList).where(MetaTierList.list_key == list_key))
    return {e["hero_id"]: e["tier"] for e in (tl.entries if tl else [])}


def hero_guide(db: Session, hero_id: str) -> dict | None:
    g = db.scalar(select(MetaHeroGuide).where(MetaHeroGuide.hero_id == hero_id))
    if not g:
        return None
    name = lambda h: registry().heroes[h].name if h in registry().heroes else h  # noqa: E731
    return {
        "hero_id": hero_id, "url": g.url, "fetched_at": g.fetched_at.isoformat(),
        "synergies": [{"hero_id": h, "hero": name(h)} for h in g.synergies],
        "counters": [{"hero_id": h, "hero": name(h)} for h in g.counters],
        "builds": g.builds,
    }


def all_guides(db: Session) -> dict[str, MetaHeroGuide]:
    return {g.hero_id: g for g in db.scalars(select(MetaHeroGuide))}


def best_combos(db: Session, limit: int = 30) -> list[dict]:
    """Duos recommandés : synergies citées par Icy Veins, renforcées si réciproques et bien classées."""
    tiers = all_tiers(db, "general")
    rank = {"S": 5, "A": 4, "B": 3, "C": 2, "D": 1}
    guides = all_guides(db)
    pairs: dict[tuple[str, str], dict] = {}
    for hero_id, g in guides.items():
        for other in g.synergies:
            key = tuple(sorted((hero_id, other)))
            p = pairs.setdefault(key, {"heroes": list(key), "mentions": 0})
            p["mentions"] += 1
    out = []
    for (a, b), p in pairs.items():
        if a not in registry().heroes or b not in registry().heroes:
            continue
        score = p["mentions"] * 3 + rank.get(tiers.get(a, ""), 2) + rank.get(tiers.get(b, ""), 2)
        out.append({
            "heroes": [{"hero_id": h, "hero": registry().heroes[h].name, "tier": tiers.get(h)} for h in (a, b)],
            "mutual": p["mentions"] > 1, "score": score,
        })
    out.sort(key=lambda x: x["score"], reverse=True)
    return out[:limit]
