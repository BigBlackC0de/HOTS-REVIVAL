"""Lecture des pages Icy Veins (tier lists et guides de héros).

Les pages sont téléchargées par l'application (navigateur intégré d'Electron, ou
httpx en repli) puis analysées ici. Structure connue des pages :
- tier list : un élément `<span id="ranking-<slug>">` par héros, classé sous un libellé de tier ;
- guide : portraits `img.hero_portrait_good` (synergies) / `hero_portrait_bad` (contres)
  avec `data-heroes-tooltip="hero-<slug>"`, builds dans `div.heroes_build_talents`
  (un `span.heroes_build_talent_tier_visual` par palier, le talent choisi porte la classe
  `heroes_build_talent_tier_yes`).
Le parseur est volontairement tolérant : si Icy Veins change sa mise en page, il renvoie
une liste vide et l'application garde les dernières données valides.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from bs4 import BeautifulSoup, Tag

from app.reference import ROLES, normalize, registry
from app.talents import TALENT_LEVELS, talent_at

BASE = "https://www.icy-veins.com/heroes"
TIER_LISTS: dict[str, dict[str, str]] = {
    "general": {"title": "Générale (Bronze → Platine)", "url": f"{BASE}/heroes-of-the-storm-general-tier-list"},
    "master": {"title": "Master (Diamant → Grand Maître)", "url": f"{BASE}/heroes-of-the-storm-master-tier-list"},
    "quick_match": {"title": "Partie rapide", "url": f"{BASE}/heroes-of-the-storm-quick-match-tier-list"},
    "aram": {"title": "ARAM", "url": f"{BASE}/heroes-of-the-storm-aram-tier-list"},
}
TIER_ORDER = ("S", "A", "B", "C", "D")
_TIER_LABEL = re.compile(r"^\s*(?:tier\s*)?([SABCD])(?:\s*[-–]?\s*tier)?\s*$", re.IGNORECASE)
_TIER_CLASS = re.compile(r"(?:tier|htl)[-_ ]?([sabcd])(?:\b|_|-)", re.IGNORECASE)
_ROLE_WORDS = {
    "tank": "Tank", "bruiser": "Bruiser", "offlaner": "Bruiser", "healer": "Healer", "support": "Support",
    "ranged": "Ranged Assassin", "melee": "Melee Assassin",
}
_UPDATED = re.compile(r"(?:last updated|updated on|mis à jour)[^<]{0,40}?(\w{3,9}\.? \d{1,2},? \d{4})", re.IGNORECASE)


@dataclass
class TierEntry:
    hero_id: str
    tier: str
    role: str | None = None


@dataclass
class HeroGuide:
    hero_id: str
    synergies: list[str] = field(default_factory=list)
    counters: list[str] = field(default_factory=list)
    builds: list[dict] = field(default_factory=list)


def hero_from_slug(slug: str) -> str | None:
    hero = registry().resolve_hero(slug.replace("-build-guide", ""))
    return hero.id if hero else None


def guide_url(slug: str) -> str:
    return f"{BASE}/{slug}-build-guide"


def updated_label(html: str) -> str | None:
    m = _UPDATED.search(html)
    return m.group(1) if m else None


def _own_text(tag: Tag) -> str:
    return " ".join(s.strip() for s in tag.find_all(string=True, recursive=False)).strip()


def _tier_from_ancestors(tag: Tag) -> str | None:
    for parent in tag.parents:
        if not isinstance(parent, Tag):
            continue
        attrs = " ".join(parent.get("class", [])) + " " + (parent.get("id") or "")
        m = _TIER_CLASS.search(attrs)
        if m:
            return m.group(1).upper()
    return None


def _role_of(text: str) -> str | None:
    low = text.lower()
    if len(low) > 40:
        return None
    for word, role in _ROLE_WORDS.items():
        if word in low:
            return role
    return None


def parse_tier_list(html: str) -> list[TierEntry]:
    soup = BeautifulSoup(html, "html.parser")
    entries: dict[str, TierEntry] = {}
    current_tier: str | None = None
    current_role: str | None = None
    hero_marks = soup.find_all("span", id=re.compile(r"^ranking-"))
    use_links = not hero_marks

    for el in soup.find_all(True):
        text = _own_text(el)
        is_label_el = el.name in ("h2", "h3", "h4", "h5", "h6") or any(
            "tier" in c.lower() for c in el.get("class", [])
        )
        if is_label_el and text and len(text) <= 30:
            m = _TIER_LABEL.match(text)
            role = _role_of(text)
            if m:
                current_tier = m.group(1).upper()
            elif role:
                current_role = role
            elif el.name in ("h2", "h3"):
                current_tier = None  # section sans rapport (héros gratuits, changelog…)

        slug = None
        if not use_links and el.name == "span" and (el.get("id") or "").startswith("ranking-"):
            slug = el["id"][len("ranking-"):]
        elif use_links and el.name == "a":
            m = re.search(r"/heroes/([a-z0-9-]+)-build-guide", el.get("href", ""))
            slug = m.group(1) if m else None
        if not slug:
            continue
        hero_id = hero_from_slug(slug)
        tier = _tier_from_ancestors(el) or current_tier
        if hero_id and tier and hero_id not in entries:
            hero = registry().heroes[hero_id]
            entries[hero_id] = TierEntry(hero_id, tier, current_role or hero.role)
    return sorted(entries.values(), key=lambda e: (TIER_ORDER.index(e.tier), e.hero_id))


def tier_slugs(html: str) -> dict[str, str]:
    """hero_id -> slug Icy Veins (pour construire l'URL des guides)."""
    soup = BeautifulSoup(html, "html.parser")
    out: dict[str, str] = {}
    for span in soup.find_all("span", id=re.compile(r"^ranking-")):
        slug = span["id"][len("ranking-"):]
        hero_id = hero_from_slug(slug)
        if hero_id:
            out.setdefault(hero_id, slug)
    for a in soup.find_all("a", href=re.compile(r"/heroes/[a-z0-9-]+-build-guide")):
        slug = re.search(r"/heroes/([a-z0-9-]+)-build-guide", a["href"]).group(1)
        hero_id = hero_from_slug(slug)
        if hero_id:
            out.setdefault(hero_id, slug)
    return out


def _portraits(soup: BeautifulSoup, kind: str) -> list[str]:
    out: list[str] = []
    for img in soup.find_all("img", class_=f"hero_portrait_{kind}"):
        slug = (img.get("data-heroes-tooltip") or "").removeprefix("hero-")
        hero_id = hero_from_slug(slug) if slug else None
        if hero_id and hero_id not in out:
            out.append(hero_id)
    return out


def parse_hero_guide(html: str, hero_id: str) -> HeroGuide:
    soup = BeautifulSoup(html, "html.parser")
    guide = HeroGuide(hero_id, synergies=_portraits(soup, "good"), counters=_portraits(soup, "bad"))
    guide.synergies = [h for h in guide.synergies if h != hero_id]
    guide.counters = [h for h in guide.counters if h != hero_id]

    for i, block in enumerate(soup.find_all("div", class_="heroes_build_talents")):
        title_tag = block.find_previous(["h3", "h4"])
        title = _own_text(title_tag) if title_tag else ""
        talents = []
        for level, tier in zip(TALENT_LEVELS, block.find_all("span", class_="heroes_build_talent_tier_visual")):
            choices = [c for c in tier.find_all("span", recursive=False)] or tier.find_all("span")
            for position, choice in enumerate(choices, start=1):
                if "heroes_build_talent_tier_yes" in choice.get("class", []):
                    talent = talent_at(hero_id, level, position)
                    talents.append({"level": level, "position": position,
                                    "talent": talent["id"] if talent else None,
                                    "name": talent["name"] if talent else f"Talent {position}"})
                    break
        if talents:
            guide.builds.append({"title": title or f"Build {i + 1}", "talents": talents})
    return guide


def normalize_title(text: str) -> str:
    return normalize(text)


__all__ = ["TIER_LISTS", "parse_tier_list", "parse_hero_guide", "tier_slugs", "guide_url", "ROLES"]
