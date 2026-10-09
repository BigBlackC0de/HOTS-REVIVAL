"""Draft Assistant – analyse de composition à partir d'informations publiques.

Le moteur est déterministe (règles sur profils de héros + statistiques
personnelles optionnelles). Claude peut ensuite reformuler/approfondir.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field

from app.reference import ROLES, Hero, registry

# Combos connus (paires) : (héros A, héros B, explication)
NAMED_COMBOS: list[tuple[str, str, str]] = [
    ("etc", "jaina", "Mosh Pit d'E.T.C. + zone de Jaina : combo d'élimination de groupe."),
    ("etc", "kaelthas", "Mosh Pit d'E.T.C. + Pyroblast/Flamestrike : burst de zone garanti."),
    ("etc", "liming", "Mosh Pit d'E.T.C. + combo de Li-Ming : dégâts massifs sur cibles immobilisées."),
    ("arthas", "jaina", "Double ralentissement givre : très difficile à fuir."),
    ("tyrande", "valla", "Marque du chasseur + dégâts soutenus : focus des tanks."),
    ("abathur", "illidan", "Symbiote et clone sur Illidan : plongée quasi immortelle."),
    ("abathur", "tracer", "Tracer avec Abathur : pression de plongée renforcée."),
    ("garrosh", "kelthuzad", "Déplacements forcés + chaînes de Kel'Thuzad : prises garanties."),
]

PHASES = ("early", "mid", "late")
TIER_BONUS = {"S": 1.5, "A": 1.0, "B": 0.5, "C": 0.0, "D": -0.5}


@dataclass
class MetaData:
    """Données Icy Veins : tiers et, par héros, synergies / héros qui le contrent."""

    tiers: dict[str, str] = field(default_factory=dict)
    synergies: dict[str, list[str]] = field(default_factory=dict)
    countered_by: dict[str, list[str]] = field(default_factory=dict)

    def synergy(self, a: str, b: str) -> bool:
        return b in self.synergies.get(a, []) or a in self.synergies.get(b, [])

    def counters(self, attacker: str, target: str) -> bool:
        """`attacker` contre `target` selon le guide de `target`."""
        return attacker in self.countered_by.get(target, [])


@dataclass
class TeamProfile:
    heroes: list[Hero]
    roles: Counter
    tags: Counter
    curve: tuple[float, float, float]

    def has(self, tag: str, n: int = 1) -> bool:
        return self.tags[tag] >= n


@dataclass
class DraftAnalysis:
    strengths: list[str] = field(default_factory=list)
    weaknesses: list[str] = field(default_factory=list)
    synergies: list[str] = field(default_factory=list)
    threats: list[str] = field(default_factory=list)
    win_conditions: list[str] = field(default_factory=list)
    counters: list[str] = field(default_factory=list)
    phases: dict[str, int] = field(default_factory=dict)  # % de puissance estimée alliée
    recommendations: list[dict] = field(default_factory=list)
    composition_score: int = 50
    unknown_heroes: list[str] = field(default_factory=list)


def _profile(heroes: list[Hero]) -> TeamProfile:
    tags: Counter = Counter()
    for h in heroes:
        tags.update(h.tags)
    curve = tuple(sum(h.curve[i] for h in heroes) / max(len(heroes), 1) for i in range(3))
    return TeamProfile(heroes, Counter(h.role for h in heroes), tags, curve)  # type: ignore[arg-type]


def _resolve(raw: list[str], unknown: list[str]) -> list[Hero]:
    out = []
    for name in raw:
        hero = registry().resolve_hero(name)
        if hero:
            out.append(hero)
        else:
            unknown.append(name)
    return out


def counter_score(candidate: Hero, enemy: TeamProfile) -> float:
    """Dans quelle mesure `candidate` punit la composition adverse (0..~5)."""
    t = candidate.tags
    score = 0.0
    if "antiheal" in t and (enemy.roles["Healer"] or enemy.tags["selfsustain"] >= 2):
        score += 1.2
    if "antitank" in t and enemy.tags["frontline"] >= 2:
        score += 1.2
    if ("cc" in t or "peel" in t) and enemy.tags["dive"] + enemy.tags["mobility"] >= 3:
        score += 1.0
    if "dive" in t and enemy.tags["protect"] >= 2:
        score += 1.0
    if "cleanse" in t and enemy.tags["cc"] >= 4:
        score += 0.8
    if "waveclear" in t and enemy.tags["split"] >= 2:
        score += 0.6
    if "selfsustain" in t and enemy.tags["poke"] >= 2:
        score += 0.6
    if "poke" in t and not enemy.roles["Healer"]:
        score += 0.6
    return score


def synergy_score(candidate: Hero, allies: TeamProfile) -> float:
    score = 0.0
    ids = {h.id for h in allies.heroes}
    for a, b, _ in NAMED_COMBOS:
        if (candidate.id == a and b in ids) or (candidate.id == b and a in ids):
            score += 1.5
    if "protect" in candidate.tags and (allies.tags["peel"] + allies.tags["frontline"]) >= 2:
        score += 0.5
    if "engage" in candidate.tags and allies.tags["aoe"] + allies.tags["burst"] >= 2:
        score += 0.7
    if "aoe" in candidate.tags and allies.tags["engage"] >= 1:
        score += 0.5
    return score


def role_need(candidate: Hero, allies: TeamProfile) -> float:
    r = allies.roles
    if candidate.role == "Tank":
        return 2.0 if r["Tank"] == 0 else -1.5
    if candidate.role == "Healer":
        return 2.0 if r["Healer"] == 0 else -1.5
    if candidate.role in ("Ranged Assassin", "Melee Assassin"):
        dps = r["Ranged Assassin"] + r["Melee Assassin"]
        return 1.0 if dps < 2 else (-0.5 if dps >= 3 else 0.2)
    if candidate.role == "Bruiser":
        return 0.8 if r["Bruiser"] == 0 else -0.5
    return 0.2 if r["Support"] == 0 else -1.5


def _composition_score(team: TeamProfile, enemy: TeamProfile) -> int:
    score = 50.0
    score += 8 if team.roles["Tank"] else -12
    score += 8 if team.roles["Healer"] else -12
    score += 4 if team.has("waveclear", 2) else -4
    score += 4 if team.has("cc", 3) else -4
    score += min(sum(counter_score(h, enemy) for h in team.heroes), 6) * 2
    score -= min(sum(counter_score(h, team) for h in enemy.heroes), 6) * 2
    ids = {h.id for h in team.heroes}
    score += sum(4 for a, b, _ in NAMED_COMBOS if a in ids and b in ids)
    return int(max(0, min(100, round(score))))


def analyze_draft(
    allies: list[str],
    enemies: list[str],
    map_id: str | None = None,
    bans: list[str] | None = None,
    personal_winrates: dict[str, float] | None = None,
    top_n: int = 5,
    meta: MetaData | None = None,
) -> DraftAnalysis:
    result = DraftAnalysis()
    meta = meta or MetaData()
    ally_heroes = _resolve(allies, result.unknown_heroes)
    enemy_heroes = _resolve(enemies, result.unknown_heroes)
    ally, enemy = _profile(ally_heroes), _profile(enemy_heroes)

    # Forces / faiblesses
    if ally.has("burst", 2) and ally.has("cc", 2):
        result.strengths.append("Votre composition gagne les combats courts : engagez sur une cible isolée.")
    if ally.has("sustained", 2) or (ally.roles["Healer"] and ally.has("selfsustain", 2)):
        result.strengths.append("Votre composition gagne les combats longs : évitez les échanges explosifs.")
    if ally.has("poke", 2):
        result.strengths.append("Bon potentiel de harcèlement avant les objectifs.")
    if ally.has("waveclear", 2):
        result.strengths.append("Excellent clear de vagues : vous pouvez tenir la carte et faire des rotations.")
    if ally.has("global"):
        result.strengths.append("Présence globale : punissez les joueurs isolés sur les autres lignes.")
    if ally_heroes and not ally.roles["Tank"]:
        result.weaknesses.append("Pas de tank : difficile d'initier et d'absorber l'engagement adverse.")
    if ally_heroes and not ally.roles["Healer"]:
        result.weaknesses.append("Pas de soigneur : privilégiez les combats courts et les fontaines.")
    if ally_heroes and ally.tags["waveclear"] == 0:
        result.weaknesses.append("Peu de clear de vagues : risque de perdre la pression sur les lignes.")
    if ally_heroes and ally.tags["cc"] <= 1:
        result.weaknesses.append("Peu de contrôle : difficile de verrouiller une cible.")

    # Héros à protéger
    for h in ally_heroes:
        if "protect" in h.tags and enemy.tags["dive"] + enemy.tags["stealth"] >= 2:
            result.win_conditions.append(f"Protégez {h.name} : l'adversaire dispose d'outils de plongée.")

    # Synergies / menaces nommées
    ally_ids, enemy_ids = {h.id for h in ally_heroes}, {h.id for h in enemy_heroes}
    for a, b, why in NAMED_COMBOS:
        if a in ally_ids and b in ally_ids:
            result.synergies.append(why)
        if a in enemy_ids and b in enemy_ids:
            na, nb = registry().heroes[a].name, registry().heroes[b].name
            result.threats.append(f"Attention au combo {na} + {nb}. {why}")
    for a in ally_heroes:
        for b in ally_heroes:
            if a.id < b.id and meta.synergy(a.id, b.id):
                result.synergies.append(f"Bonne synergie {a.name} + {b.name} (Icy Veins).")
        for e in enemy_heroes:
            if meta.counters(e.id, a.id):
                result.threats.append(f"{a.name} est contré par {e.name} : jouez prudemment.")
    if enemy.has("dive", 2):
        result.threats.append("L'équipe adverse plonge : restez groupés autour de vos héros fragiles.")
    if enemy.has("poke", 2):
        result.threats.append("Fort harcèlement adverse : n'entamez pas l'objectif à mi-vie.")

    # Counters directs
    for h in ally_heroes:
        cs = counter_score(h, enemy)
        if cs >= 1.0:
            result.counters.append(f"{h.name} est efficace contre cette composition adverse.")

    # Phases de jeu
    for i, phase in enumerate(PHASES):
        if ally_heroes and enemy_heroes:
            diff = ally.curve[i] - enemy.curve[i]
            result.phases[phase] = int(max(25, min(75, round(50 + diff * 25))))
        else:
            result.phases[phase] = 50
    best = max(result.phases, key=result.phases.get)
    labels = {"early": "début de partie", "mid": "milieu de partie", "late": "fin de partie"}
    if result.phases[best] >= 55:
        result.win_conditions.append(f"Votre fenêtre de puissance : {labels[best]}. Jouez les objectifs à ce moment.")
    if result.phases["late"] <= 45:
        result.win_conditions.append("L'adversaire scale mieux : terminez la partie avant le niveau 20.")

    # Conseils carte
    if map_id:
        info = registry().resolve_map(map_id)
        if info:
            result.win_conditions.extend(info.tips[:1])

    # Recommandations de picks
    taken = ally_ids | enemy_ids | {h.id for h in _resolve(bans or [], [])}
    if len(ally_heroes) < 5:
        candidates = []
        for hero in registry().heroes.values():
            if hero.id in taken:
                continue
            score = role_need(hero, ally) + counter_score(hero, enemy) + synergy_score(hero, ally)
            score += TIER_BONUS.get(meta.tiers.get(hero.id, ""), 0.0)
            score += 1.2 * sum(meta.counters(hero.id, e.id) for e in enemy_heroes)
            score -= 1.0 * sum(meta.counters(e.id, hero.id) for e in enemy_heroes)
            score += 1.0 * sum(meta.synergy(hero.id, a.id) for a in ally_heroes)
            personal = (personal_winrates or {}).get(hero.id)
            if personal is not None:
                score += (personal - 0.5) * 4
            candidates.append((score, hero, personal))
        candidates.sort(key=lambda c: c[0], reverse=True)
        for score, hero, personal in candidates[:top_n]:
            result.recommendations.append(
                {"hero_id": hero.id, "hero": hero.name, "role": hero.role, "score": round(score, 2),
                 "personal_winrate": personal, "tier": meta.tiers.get(hero.id)}
            )
        if result.recommendations:
            top = result.recommendations[0]["hero"]
            result.counters.insert(0, f"{top} est le meilleur choix contre cette draft.")

    result.composition_score = _composition_score(ally, enemy)
    return result


__all__ = ["analyze_draft", "DraftAnalysis", "MetaData", "ROLES"]
