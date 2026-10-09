# 7. Schémas d'API

Base : `http://127.0.0.1:8765`. Documentation interactive OpenAPI générée par FastAPI : `/docs` (Swagger) et `/openapi.json`.

## 7.1 Référentiel & système
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/health` | `{"status":"ok"}` |
| GET | `/api/compliance` | Sources autorisées, interdits, déclaration |
| GET | `/api/heroes` | `[{id, name, role, tags[], curve[3]}]` |
| GET | `/api/maps` | `[{id, name, objective, first_objective_s, objective_interval_s, verified, tips[]}]` |
| GET | `/api/talents/{hero_id}` | `{hero_id, tiers:[{tier, level, options:[{talent, games, winrate, popularity, smoothed_winrate}]}]}` |

## 7.2 Profil
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/profile` | Profil complet (voir ci-dessous) |
| GET | `/api/profile/progression` | `[{match_id, played_at, hero, win, heros_score, rolling_winrate}]` |

```json
{
  "player": {"name": "Azsra", "battletag": "Azsra#2154", "toon_handle": "2-Hero-1-1278570", "rank": null},
  "total": {"games": 30, "wins": 16, "winrate": 0.533, "smoothed_winrate": 0.528, "avg_heros_score": 52.7},
  "by_role": {"Ranged Assassin": {"games": 16, "wins": 8, "winrate": 0.5, "...": "..."}},
  "by_hero": {"valla": {"hero": "Valla", "games": 6, "wins": 4, "...": "..."}},
  "best_hero": "Muradin", "worst_hero": "Raynor",
  "main_role": "Ranged Assassin", "secondary_role": "Healer",
  "heroes_to_avoid": ["Raynor"],
  "trend": {"last_10_winrate": 0.5, "previous_10_winrate": 0.5, "direction": "stable"},
  "category_averages": {"placement": 54.5, "macro": 56.1, "teamfight": 47, "objectives": 57.5, "survival": 57.6, "draft": 50.6}
}
```

## 7.3 Parties & rapports
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/matches?limit=20&offset=0&hero_id=` | Liste `MatchSummary` (avec `me`) |
| GET | `/api/matches/{id}` | `MatchDetail` : 10 joueurs + scores + évènements |
| GET | `/api/matches/{id}/report` | `{match_id, facts, ai_summary, model}` |
| POST | `/api/matches/{id}/report/ai` | Génère le résumé Claude (sortie structurée) ; repli déterministe sans clé |

`ai_summary` (validé par Pydantic côté serveur) :
```json
{
  "summary": "Partie perdue à 13:45 sur Tours du Destin…",
  "strengths": ["Bonne présence en teamfight."],
  "weaknesses": ["5 morts.", "Temps passé mort : 158 secondes."],
  "key_moments": ["5:00 – Votre équipe perd 3 héros en un combat."],
  "major_mistakes": ["…"],
  "excellent_actions": ["…"],
  "improvement_plan": ["Réduire vos morts à 3 maximum."]
}
```

## 7.4 Replays
| Méthode | Route | Corps | Réponse |
|---|---|---|---|
| GET | `/api/replays/status` | – | `{folder, folder_exists, watching, toon_handle, counts}` |
| POST | `/api/replays/import` | `{path?: string}` (fichier ou dossier) | `{imported, duplicates, failed, match_ids[]}` |

## 7.5 Draft
`POST /api/draft/analyze`
```json
// requête
{"allies": ["valla", "uther"], "enemies": ["etc", "jaina"], "bans": [], "map_id": "towers_of_doom", "use_personal_stats": true}
// réponse
{
  "strengths": [], "weaknesses": ["Pas de tank : …"], "synergies": [],
  "threats": ["Attention au combo E.T.C. + Jaina. …"],
  "win_conditions": ["Les autels ne se capturent qu'avec de la présence : …"],
  "counters": ["Muradin est le meilleur choix contre cette draft."],
  "phases": {"early": 50, "mid": 50, "late": 50},
  "recommendations": [{"hero_id": "muradin", "hero": "Muradin", "role": "Tank", "score": 2.4, "personal_winrate": 0.6}],
  "composition_score": 38, "unknown_heroes": []
}
```
Les héros acceptent l'id (`etc`), le nom (`E.T.C.`) ou l'identifiant interne du replay (`HeroL90ETC`).

## 7.6 Coach (Server-Sent Events)
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/coach/status` | `{available, model}` |
| POST | `/api/coach/chat` | Corps `{message, conversation_id?, match_id?}` → flux SSE |
| GET | `/api/coach/conversations/{id}` | Historique |

Flux :
```
event: start   data: {"conversation_id": 12}
event: delta   data: {"text": "Votre principal problème…"}
event: error   data: {"message": "Limite de requêtes atteinte…"}   (optionnel)
event: done    data: {"conversation_id": 12}
```

## 7.7 Overlay / live
| Méthode | Route | Corps |
|---|---|---|
| GET | `/api/live/state` | – |
| POST | `/api/live/start` | `{map_id?, my_hero_id?, clock_s=0}` |
| POST | `/api/live/sync` | `{clock_s}` |
| POST | `/api/live/levels` | `{ally?, enemy?, ally_delta?, enemy_delta?}` |
| POST | `/api/live/camp` | `{camp_type: siege|bruiser|boss|support|other, side: ally|enemy}` |
| POST | `/api/live/objective-done` | – |
| POST | `/api/live/stop` | – |
| WS | `/ws/live` | Messages `overlay` (1/s), `match_imported`, `game_loading` |

`OverlayState` :
```json
{
  "status": "in_game", "clock_s": 118.0, "map_id": "towers_of_doom", "my_hero_id": "valla",
  "lobby_players": [],
  "levels": {"ally": 9, "enemy": 10, "ally_tier": 3, "enemy_tier": 4},
  "objective": {"name": "Autels", "map": "Towers of Doom", "next_in_s": 32, "estimated": true,
                "priority": "Regroupement pour l'objectif", "tips": ["…"]},
  "camps": [{"camp": "siege", "side": "ally", "respawn_in_s": 178}],
  "talents": [{"level": 1, "recommended": {"talent": "…", "winrate": 0.58, "popularity": 0.4}, "alternatives": []}],
  "alerts": [{"id": "enemy-adv-4", "text": "L'équipe adverse possède un avantage de talent.", "level": "danger"}],
  "tips": ["Ne forcez pas un combat en infériorité de talent.", "Restez groupés."],
  "sources": ["user_input", "battlelobby_file", "static_data", "own_history"]
}
```

## 7.8 Erreurs
Format FastAPI standard : `{"detail": "message"}` avec 400 (chemin invalide), 404 (ressource absente), 422 (validation Pydantic).
