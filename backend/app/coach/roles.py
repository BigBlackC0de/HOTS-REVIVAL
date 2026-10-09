"""Connaissances par rôle : ce qui compte, repères chiffrés et habitudes des meilleurs joueurs.

Sert à interpréter les statistiques relativement au rôle (un soigneur fait peu de
dégâts, un tank encaisse beaucoup) et à donner des conseils propres au rôle joué.
"""
from __future__ import annotations

ROLE_PLAYBOOK: dict[str, dict] = {
    "Healer": {
        "label": "Soigneur",
        "focus": ["part des soins de l'équipe", "morts et temps mort", "participation aux éliminations",
                  "protection / purges"],
        "normal": "Une faible part de dégâts (2 à 8 %) est normale : le soigneur se juge sur ses soins "
                  "(viser 40 à 75 % des soins de l'équipe) et sur sa survie.",
        "habits": [
            "Se placer derrière la ligne de front, à portée de soin mais hors de portée des engagements adverses.",
            "Garder le soin principal / l'immunité pour les engagements adverses plutôt que de le dépenser sur du harcèlement.",
            "Surveiller les cooldowns d'engagement adverses visibles (ultimes lancés) avant d'avancer.",
            "Ne jamais vérifier un buisson seul : laisser le tank ou le combattant ouvrir le passage.",
            "Gérer son mana entre les combats : rentrer à la fontaine plutôt que d'arriver vide à l'objectif.",
        ],
    },
    "Tank": {
        "label": "Tank",
        "focus": ["dégâts encaissés", "temps de contrôle sur les héros adverses", "participation", "morts"],
        "normal": "Les dégâts aux héros sont secondaires ; on attend 15 à 35 % des dégâts encaissés de l'équipe "
                  "et beaucoup de contrôles.",
        "habits": [
            "Engager quand l'équipe est à portée et que l'adversaire a utilisé ses outils de fuite.",
            "Se placer devant les objectifs 15 à 20 s avant leur apparition pour prendre la zone.",
            "Protéger les héros fragiles quand l'adversaire plonge plutôt que de poursuivre.",
            "Utiliser la vision (tours de guet, buissons) pour l'équipe.",
        ],
    },
    "Bruiser": {
        "label": "Combattant",
        "focus": ["XP et dégâts de siège", "camps de mercenaires", "survie en ligne solo", "présence aux objectifs"],
        "normal": "Un combattant porte la macro : forte part d'XP et de siège, plusieurs camps par tranche de 10 minutes.",
        "habits": [
            "Tenir la ligne solo sans mourir : reculer dès que l'adversaire disparaît de la mini-carte.",
            "Prendre les camps de siège quand la ligne est poussée et que l'objectif est loin.",
            "Rejoindre l'équipe avant l'objectif plutôt que d'arriver pendant le combat.",
        ],
    },
    "Ranged Assassin": {
        "label": "Assassin à distance",
        "focus": ["part des dégâts aux héros", "morts et temps mort", "participation", "dégâts de siège"],
        "normal": "On attend 15 à 30 % des dégâts aux héros de l'équipe avec peu de morts : chaque mort coupe la source de dégâts.",
        "habits": [
            "Rester à portée maximale et viser la cible la plus proche atteignable, pas la plus fragile hors de portée.",
            "Garder un outil de fuite pour les plongées adverses.",
            "Ne pas avancer sans vision sur les flancs.",
        ],
    },
    "Melee Assassin": {
        "label": "Assassin de mêlée",
        "focus": ["éliminations des cibles fragiles", "timing des plongées", "morts", "participation"],
        "normal": "Les morts sont plus fréquentes qu'en distance, mais chaque plongée doit rapporter une élimination.",
        "habits": [
            "Plonger après l'engagement du tank ou quand le soigneur adverse a utilisé ses cooldowns.",
            "Cibler les héros isolés pendant les rotations plutôt que la ligne de front.",
            "Sortir du combat dès que la cible a utilisé son immunité.",
        ],
    },
    "Support": {
        "label": "Soutien",
        "focus": ["présence globale / macro", "protection apportée", "XP", "survie"],
        "normal": "Le soutien se juge sur l'utilité (boucliers, macro) plus que sur les dégâts.",
        "habits": [
            "Synchroniser ses capacités globales avec les engagements de l'équipe.",
            "Maintenir la pression sur les lignes inactives entre les objectifs.",
        ],
    },
}


def role_context(role: str | None) -> dict:
    return ROLE_PLAYBOOK.get(role or "", ROLE_PLAYBOOK["Ranged Assassin"])


def role_balance(by_role: dict[str, dict]) -> dict:
    """Répartition des rôles joués et suggestion de diversification."""
    total = sum(b["games"] for b in by_role.values()) or 1
    shares = {role: round(b["games"] / total, 2) for role, b in by_role.items()}
    main = max(shares, key=shares.get) if shares else None
    out = {"shares": shares, "main_role": main, "advice": None}
    if main and shares[main] >= 0.6 and total >= 10:
        out["advice"] = (
            f"{round(shares[main] * 100)} % de vos parties sont en {role_context(main)['label'].lower()} : "
            "développer un second rôle (idéalement un rôle de dégâts si vous jouez surtout soutien/soigneur) "
            "rend vos drafts plus flexibles et vos statistiques plus équilibrées."
        )
    return out
