# 6. Base de données

PostgreSQL 16 (JSONB pour les données semi-structurées). Le DDL complet est généré depuis les modèles : [`backend/sql/schema.sql`](../backend/sql/schema.sql) (`python backend/scripts/export_schema.py`).

## 6.1 Modèle entité-association

```mermaid
erDiagram
    players ||--o{ match_players : "joue"
    replays ||--|| matches : "contient"
    matches ||--|{ match_players : "10 joueurs"
    matches ||--o{ match_events : "chronologie"
    match_players ||--o| heros_scores : "note"
    matches ||--o{ reports : "rapport"
    match_players ||--o{ reports : "pour"
    matches ||--o{ coach_conversations : "contexte"
    coach_conversations ||--|{ coach_messages : "messages"

    players {
        int id PK
        string toon_handle UK "2-Hero-1-1278570"
        string name
        string battletag
        int region
        string rank
        bool is_me
    }
    replays {
        int id PK
        text file_path
        string file_hash UK "SHA-256"
        string status "pending|parsed|failed"
        text error
    }
    matches {
        int id PK
        int replay_id FK
        string map_id
        string map_name
        string game_mode
        string game_version
        timestamptz played_at
        int duration_s
        int winner_team
        jsonb team_levels
    }
    match_players {
        int id PK
        int match_id FK
        int player_id FK
        int slot
        int team
        bool is_winner
        bool is_me
        string hero_id
        string role
        int kills_deaths_assists "colonnes séparées"
        int hero_damage
        int siege_damage
        int healing
        int xp_contribution
        int time_spent_dead_s
        jsonb stats "écran de score complet"
        jsonb talents
    }
    match_events {
        int id PK
        int match_id FK
        float t_s
        string kind "death|level|camp|objective"
        int team
        int slot
        jsonb payload
    }
    heros_scores {
        int id PK
        int match_player_id FK
        int placement
        int macro
        int teamfight
        int objectives
        int survival
        int draft
        int overall
        string algo_version
        jsonb details
    }
    reports {
        int id PK
        int match_id FK
        int match_player_id FK
        jsonb facts
        jsonb ai_summary
        string model
    }
    drafts {
        int id PK
        string map_id
        jsonb allies
        jsonb enemies
        jsonb bans
        jsonb result
    }
    coach_conversations {
        int id PK
        int match_id FK
        string title
    }
    coach_messages {
        int id PK
        int conversation_id FK
        string role
        text content
    }
```

## 6.2 Choix de modélisation
- **Colonnes dédiées** pour les statistiques interrogées souvent (KDA, dégâts, XP…) ; **JSONB `stats`** pour l'écran de score complet (≈ 80 clés variables selon la carte et le build).
- **HEROS SCORE stocké pour les 10 joueurs** : sert de référentiel comparatif (« votre score vs la moyenne de la partie ») et de corpus de calibrage.
- **`algo_version`** sur le score : recalcul possible lors d'une évolution de la formule.
- **Déduplication** par hash SHA-256 du fichier (`replays.file_hash` unique).
- **`players.toon_handle`** est l'identifiant stable d'un compte HotS par région (le BattleTag complet n'est pas dans les details du replay). Le joueur local est identifié via le chemin `Accounts\<id>\<toon>\Replays` ou `HOTS_PLAYER_TOON_HANDLE`.

## 6.3 Index
`players.toon_handle`, `replays.file_hash` (uniques) ; `matches.map_id`, `matches.played_at` ; `match_players.match_id`, `player_id`, `hero_id`, `is_me` ; `match_events.match_id`, `kind` ; `heros_scores.overall`.

## 6.4 Requêtes types
```sql
-- Winrate par héros du joueur local
SELECT hero_name, count(*) AS games, avg(is_winner::int) AS winrate
FROM match_players WHERE is_me GROUP BY hero_name ORDER BY games DESC;

-- Talents les plus gagnants pour un héros (tous joueurs des replays importés)
SELECT t->>'tier' AS tier, t->>'name' AS talent, count(*) AS games, avg(is_winner::int) AS winrate
FROM match_players, jsonb_array_elements(talents) AS t
WHERE hero_id = 'valla' GROUP BY 1, 2 ORDER BY 1, winrate DESC;

-- Médiane du premier objectif par carte (calibrage overlay)
SELECT m.map_id, percentile_cont(0.5) WITHIN GROUP (ORDER BY e.first_t) AS median_first_objective
FROM matches m JOIN LATERAL (
  SELECT min(t_s) AS first_t FROM match_events WHERE match_id = m.id AND kind = 'objective'
) e ON true GROUP BY m.map_id;
```

## 6.5 Évolutions V2
`users` (compte cloud) + `user_id` sur toutes les tables, `talent_catalog` (noms localisés), `hero_stats_daily` (agrégats matérialisés), `coach_goals` (objectifs suivis), migrations Alembic.
