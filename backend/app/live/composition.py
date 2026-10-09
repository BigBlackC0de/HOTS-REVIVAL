"""Compositions des deux équipes lues sur l'écran de chargement (information publique
affichée à tous les joueurs). L'application envoie les mots reconnus par OCR avec leur
position ; on y retrouve les noms de héros (français ou anglais) et les pseudos des
joueurs du fichier de chargement, puis on sépare les deux équipes par leur position.
"""
from __future__ import annotations

import unicodedata
from dataclasses import dataclass

from app.reference import registry

# Noms français différents de l'anglais
FRENCH_NAMES: dict[str, list[str]] = {
    "brightwing": ["Lumiaile"],
    "butcher": ["Le Boucher", "Boucher"],
    "sgthammer": ["Sergent Marteau", "Sgt. Marteau"],
    "lostvikings": ["Les Vikings perdus", "Vikings perdus", "Les Vikings"],
    "deathwing": ["Aile de mort", "Aile-de-mort"],
    "whitemane": ["Blanchetête"],
    "greymane": ["Grisetête"],
    "stitches": ["Recousu"],
    "hogger": ["Lardeur"],
    "junkrat": ["Chacal"],
}


@dataclass
class Word:
    text: str
    x: float  # centre, fraction de l'écran
    y: float
    h: float = 0.02


@dataclass
class Found:
    key: str  # hero_id ou pseudo
    x: float
    y: float


def norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    return "".join(c for c in text.lower() if c.isalnum())


def _distance(a: str, b: str) -> int:
    if abs(len(a) - len(b)) > 2:
        return 3
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def _same(read: str, name: str) -> bool:
    if len(name) <= 4:  # Cho, Gall, Ana, Mei, Nova… : exact uniquement
        return read == name
    return _distance(read, name) <= (1 if len(name) <= 7 else 2)


def hero_names() -> dict[str, str]:
    """nom normalisé -> hero_id"""
    out: dict[str, str] = {}
    for hero_id, hero in registry().heroes.items():
        out[norm(hero.name)] = hero_id
        if hero.name.lower().startswith("the "):
            out[norm(hero.name[4:])] = hero_id
        for alias in FRENCH_NAMES.get(hero_id, []):
            out[norm(alias)] = hero_id
    return out


def _windows(words: list[Word], size: int):
    """Groupes de 1 à `size` mots consécutifs sur une même ligne."""
    for i in range(len(words)):
        group = [words[i]]
        yield group
        for w in words[i + 1:i + size]:
            if abs(w.y - group[0].y) > max(w.h, group[0].h) or w.x < group[-1].x:
                break
            group = [*group, w]
            yield group


def find_heroes(words: list[Word]) -> list[Found]:
    names = hero_names()
    found: list[Found] = []
    for group in _windows(words, 3):
        read = norm("".join(w.text for w in group))
        if len(read) < 3:
            continue
        hero_id = names.get(read) or next((h for n, h in names.items() if _same(read, n)), None)
        if hero_id:
            x = sum(w.x for w in group) / len(group)
            y = sum(w.y for w in group) / len(group)
            if not any(f.key == hero_id and abs(f.x - x) < 0.05 and abs(f.y - y) < 0.05 for f in found):
                found.append(Found(hero_id, x, y))
    return found


def find_players(words: list[Word], players: list[str]) -> list[Found]:
    wanted = {norm(p): p for p in players if norm(p)}
    found: list[Found] = []
    for w in words:
        read = norm(w.text)
        if len(read) < 3:
            continue
        match = wanted.get(read) or next((p for n, p in wanted.items() if _same(read, n)), None)
        if match and not any(f.key == match for f in found):
            found.append(Found(match, w.x, w.y))
    return found


def split_teams(points: list[Found]) -> tuple[list[Found], list[Found]]:
    """Deux équipes = deux groupes séparés par le plus grand écart (en hauteur ou en largeur)."""
    if len(points) < 2:
        return points, []
    best: tuple[float, str, float] = (0.0, "y", 0.0)
    for axis in ("x", "y"):
        values = sorted(getattr(p, axis) for p in points)
        for a, b in zip(values, values[1:]):
            if b - a > best[0]:
                best = (b - a, axis, (a + b) / 2)
    gap, axis, cut = best
    if gap < 0.08:
        return points, []
    first = [p for p in points if getattr(p, axis) < cut]
    second = [p for p in points if getattr(p, axis) >= cut]
    return first, second


def read_composition(words: list[Word], lobby_players: list[str], my_names: set[str]) -> dict[str, dict]:
    """Associe chaque héros reconnu à un joueur (le pseudo le plus proche) et à une équipe.
    Retourne {clé: {hero_id, player, x, y}} — la clé est le pseudo, ou le héros sans pseudo."""
    names = [p.split("#")[0] for p in lobby_players]
    players = find_players(words, names)
    # un pseudo de la partie n'est jamais pris pour un héros (ex. joueur « silvanas »)
    taken = {(p.x, p.y) for p in players}
    heroes = find_heroes([w for w in words if (w.x, w.y) not in taken])
    out: dict[str, dict] = {}
    used: set[int] = set()
    for p in players:
        best, best_d = None, 0.15
        for i, h in enumerate(heroes):
            d = ((h.x - p.x) * 1.5) ** 2 + (h.y - p.y) ** 2
            if i not in used and d ** 0.5 < best_d:
                best, best_d = i, d ** 0.5
        if best is not None:
            used.add(best)
            out[p.key] = {"hero_id": heroes[best].key, "player": p.key, "x": p.x, "y": p.y,
                          "me": norm(p.key) in my_names}
    if not lobby_players:  # pas de fichier de chargement : héros seuls
        for i, h in enumerate(heroes):
            out[h.key] = {"hero_id": h.key, "player": None, "x": h.x, "y": h.y, "me": False}
    return out


def teams_from(entries: dict[str, dict]) -> dict | None:
    if not entries:
        return None
    points = [Found(k, e["x"], e["y"]) for k, e in entries.items()]
    first, second = split_teams(points)
    mine = next((k for k, e in entries.items() if e["me"]), None)
    sides_known = mine is not None and bool(second)
    if sides_known and any(p.key == mine for p in second):
        first, second = second, first
    heroes = registry().heroes

    def describe(group: list[Found]) -> list[dict]:
        rows = []
        for p in sorted(group, key=lambda p: (p.x, p.y)):
            e = entries[p.key]
            hero = heroes.get(e["hero_id"])
            rows.append({"hero_id": e["hero_id"], "hero": hero.name if hero else e["hero_id"],
                         "role": hero.role if hero else None, "player": e["player"], "me": e["me"]})
        return rows

    return {"ally": describe(first), "enemy": describe(second), "sides_known": sides_known,
            "complete": len(entries) >= 10}
