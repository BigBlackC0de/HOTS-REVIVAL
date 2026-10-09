"""Post Game Report – faits déterministes extraits du replay.

Ces faits servent (1) à afficher le rapport même sans IA et (2) de contexte
factuel à Claude, qui ne doit rien inventer au-delà.
"""
from __future__ import annotations

from app.models import Match, MatchPlayer

CATEGORY_LABELS = {
    "placement": "placement", "macro": "macro", "teamfight": "teamfight",
    "objectives": "objectifs", "survival": "survie", "draft": "draft",
}


def fmt_clock(seconds: float) -> str:
    seconds = int(seconds)
    return f"{seconds // 60}:{seconds % 60:02d}"


def _team_wipes(match: Match) -> list[dict]:
    """≥3 morts d'une même équipe en moins de 15 s."""
    wipes, deaths = [], [e for e in match.events if e.kind == "death"]
    for team in (0, 1):
        ts = [e.t_s for e in deaths if e.team == team]
        i = 0
        while i < len(ts):
            j = i
            while j + 1 < len(ts) and ts[j + 1] - ts[i] <= 15:
                j += 1
            if j - i + 1 >= 3:
                wipes.append({"t_s": ts[i], "team": team, "deaths": j - i + 1})
                i = j + 1
            else:
                i += 1
    return sorted(wipes, key=lambda w: w["t_s"])


def build_facts(match: Match, me: MatchPlayer) -> dict:
    allies = [p for p in match.players if p.team == me.team]
    team_kills = sum(p.kills for p in allies)
    kp = me.takedowns / team_kills if team_kills else 0.0

    def share(attr: str) -> float:
        total = sum(getattr(p, attr) for p in allies)
        return round(getattr(me, attr) / total, 3) if total else 0.0

    level_timings: dict[str, dict[str, str]] = {"allies": {}, "enemies": {}}
    for e in match.events:
        if e.kind == "level" and e.payload.get("level") in (10, 16, 20):
            side = "allies" if e.team == me.team else "enemies"
            level_timings[side][str(e.payload["level"])] = fmt_clock(e.t_s)

    my_deaths = [fmt_clock(e.t_s) for e in match.events if e.kind == "death" and e.slot == me.slot]
    key_moments = []
    for w in _team_wipes(match):
        who = "Votre équipe" if w["team"] == me.team else "L'équipe adverse"
        key_moments.append(f"{fmt_clock(w['t_s'])} – {who} perd {w['deaths']} héros en un combat.")
    for side, label in (("allies", "Votre équipe"), ("enemies", "L'équipe adverse")):
        for lvl, clock in level_timings[side].items():
            key_moments.append(f"{clock} – {label} atteint le niveau {lvl}.")
    key_moments.sort()

    score = me.score
    categories = {c: getattr(score, c) for c in CATEGORY_LABELS} if score else {}
    strengths, weaknesses = [], []
    if kp >= 0.7:
        strengths.append("Participation élevée aux éliminations.")
    if share("hero_damage") >= 0.28 and me.role in ("Ranged Assassin", "Melee Assassin"):
        strengths.append("Bons dégâts sur les héros adverses.")
    if me.deaths <= 2:
        strengths.append("Excellente survie.")
    if share("xp_contribution") >= 0.25:
        strengths.append("Très bonne contribution à l'expérience de l'équipe.")
    if me.deaths >= 5:
        weaknesses.append(f"{me.deaths} morts.")
    if me.time_spent_dead_s >= 90:
        weaknesses.append(f"Temps passé mort : {me.time_spent_dead_s} secondes.")
    if categories.get("macro", 100) < 45:
        weaknesses.append("Faible contribution macro (XP, siège, camps).")
    if categories:
        for c, v in sorted(categories.items(), key=lambda kv: -kv[1])[:2]:
            if v >= 75 and c != "draft":
                strengths.append(f"Catégorie {CATEGORY_LABELS[c]} solide ({v}/100).")

    weakest = min((c for c in categories if c != "draft"), key=categories.get, default=None)
    plan = []
    if weakest == "survival" or me.deaths >= 4:
        plan.append(f"Réduire vos morts à {max(2, me.deaths - 2)} maximum.")
    if weakest == "macro":
        plan.append("Prendre au moins 2 camps par tranche de 10 minutes et soaker les vagues inactives.")
    if weakest == "teamfight":
        plan.append("Rester à portée de votre équipe avant chaque objectif pour viser 70 % de participation.")
    if weakest == "placement":
        plan.append("Éviter les morts en infériorité numérique : ne pas avancer sans vision ni alliés.")
    if weakest == "objectives":
        plan.append("Être présent 20 s avant chaque objectif plutôt que d'arriver pendant le combat.")

    result = "gagnée" if me.is_winner else "perdue"
    headline = (
        f"Partie {result} à {fmt_clock(match.duration_s)} sur {match.map_name}. "
        f"Vous avez participé à {round(kp * 100)} % des éliminations."
    )
    if weakest:
        headline += f" Votre principal axe de progression : {CATEGORY_LABELS[weakest]}."

    return {
        "headline": headline,
        "result": "win" if me.is_winner else "loss",
        "map": match.map_name,
        "duration": fmt_clock(match.duration_s),
        "hero": me.hero_name,
        "role": me.role,
        "kda": {"kills": me.kills, "deaths": me.deaths, "assists": me.assists},
        "kill_participation": round(kp, 3),
        "time_spent_dead_s": me.time_spent_dead_s,
        "shares": {
            "hero_damage": share("hero_damage"), "siege_damage": share("siege_damage"),
            "healing": share("healing"), "xp_contribution": share("xp_contribution"),
        },
        "merc_camp_captures": me.merc_camp_captures,
        "my_death_times": my_deaths,
        "level_timings": level_timings,
        "key_moments": key_moments,
        "heros_score": {**categories, "overall": score.overall} if score else None,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "improvement_plan": plan,
        "talents": me.talents,
    }
