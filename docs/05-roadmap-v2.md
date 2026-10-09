# 5. Roadmap V2 (après le MVP)

| Trimestre | Thème | Fonctionnalités |
|---|---|---|
| **V2.0 (M2–M3)** | Cloud & comptes | Connexion Battle.net OAuth, synchronisation opt-in des parties, API cloud FastAPI + PostgreSQL managé, proxy Claude côté serveur (plus de clé locale), auto-update Electron |
| | Statistiques globales | Winrates de héros / talents / duos par carte et par palier de rang, agrégés et anonymisés ; Draft Assistant alimenté par ces données |
| **V2.1 (M4)** | Overlay augmenté | OCR opt-in de l'horloge et des niveaux, détection auto de la carte (écran de chargement), profils publics des joueurs du lobby (historique HOTS REVIVAL uniquement), raccourcis reconfigurables |
| **V2.2 (M5)** | Coaching avancé | Mémoire long terme du coach (objectifs fixés et suivis sur 10 parties), plans d'entraînement hebdomadaires, comparaison au rang supérieur, rapports de session (soirée de jeu) |
| | Analyse de positionnement | Heatmaps à partir des `SUnitPositionsEvent` des replays (post-partie), morts annotées sur la carte, placement réel (remplace les indicateurs indirects) |
| **V2.3 (M6)** | Social & équipe | Mode équipe / 5-stack, revue de replay partagée, export d'un rapport (image / lien), classement HEROS SCORE entre amis |
| **V3** | Écosystème | macOS, version web consultative, API publique, intégrations Discord (bot de rapports), localisation EN/ES/DE/KO |

## Prérequis techniques V2
- Alembic (migrations versionnées), multi-tenant (`user_id` sur toutes les tables).
- File de jobs (RQ/Celery ou Arq) pour les rapports IA et agrégats.
- Message Batches API de Claude pour les rapports non urgents (coût −50 %).
- RGPD : export / suppression du compte, registre des traitements, consentement analytics.
- Observabilité : traces Sentry côté API cloud, tableaux PostHog (activation, rétention J7/J30, usage coach).

## KPIs cibles
| KPI | Cible V2 |
|---|---|
| Parties importées / utilisateur actif / semaine | ≥ 10 |
| Rapports consultés / partie | ≥ 60 % |
| Questions au coach / utilisateur / semaine | ≥ 3 |
| Rétention J30 | ≥ 35 % |
| Évolution moyenne du HEROS SCORE à 30 jours | +5 points |
