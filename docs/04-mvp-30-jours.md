# 4. MVP réalisable en 30 jours

## 4.1 Objectif du MVP
Un joueur installe HOTS REVIVAL, joue une partie, et sans rien faire :
1. la partie est importée et analysée à la fin ;
2. il reçoit un **rapport post-partie** avec son **HEROS SCORE** ;
3. il peut demander au **coach IA** « Pourquoi ai-je perdu ? » ;
4. avant la partie suivante, il utilise le **Draft Assistant** ;
5. pendant la partie, l'**overlay** affiche horloge, objectif, camps, powerspikes et build.

## 4.2 Périmètre

| Inclus (MVP) | Exclu (V2+) |
|---|---|
| Import auto + manuel des replays (watcher) | Synchronisation cloud, multi-appareils |
| Profil : winrates global / rôle / héros, tendances, meilleurs/pires héros, rôles | Rang officiel (pas d'API publique Blizzard) — saisie manuelle |
| HEROS SCORE v1 (6 catégories) | Calibrage statistique sur un large corpus |
| Rapport post-partie (faits + Claude) | Vidéo / heatmap de positionnement |
| Coach IA conversationnel (streaming) | Mémoire long terme du coach, objectifs suivis |
| Draft Assistant à base de règles + winrates personnels | Statistiques globales de draft (cloud) |
| Overlay : horloge, objectif, camps, niveaux, conseils, build | OCR, détection automatique de la carte |
| Thème sombre, Windows (NSIS) | macOS, auto-update, i18n EN |
| Sentry, PostHog (opt-in) | Tableaux de bord produit avancés |

## 4.3 Planning (4 sprints d'une semaine + 2 jours de stabilisation)

| Sprint | Jours | Livrables | Critère de sortie |
|---|---|---|---|
| **S0 – Fondations** | J1–J2 | Monorepo, CI (pytest, tsc, build), docker-compose PostgreSQL, squelette Electron/React/FastAPI | `npm run build` + `pytest` verts en CI |
| **S1 – Replays** | J3–J9 | Parser heroprotocol, extracteur, modèle de données, watcher, import manuel, liste des parties | 50 replays réels importés sans erreur, déduplication OK |
| **S2 – Analyse** | J10–J16 | Profil joueur, HEROS SCORE v1, rapport déterministe, écran rapport, tableau de bord | Rapport affiché < 3 s après la fin de partie |
| **S3 – IA & Draft** | J17–J23 | Coach Claude (SSE), résumé IA structuré, Draft Assistant + recommandations | 10 questions types répondues avec données citées |
| **S4 – Overlay** | J24–J28 | Fenêtre overlay, session live, raccourcis, battlelobby, build de talents, calibrage timings | Partie réelle jouée avec overlay sans gêne ni perte de FPS mesurable |
| **Stabilisation** | J29–J30 | Packaging PyInstaller + NSIS, tests utilisateurs (5 joueurs), correctifs, doc | Installateur fonctionnel sur Windows 10/11 vierge |

## 4.4 Équipe type
- 1 dev full-stack TypeScript/Electron (UI, overlay, packaging)
- 1 dev Python (parser, analytics, API, IA)
- 0,5 designer UX gaming (maquettes S1, polish S4)
- 0,25 joueur expert HotS (validation heuristiques draft, timings, HEROS SCORE)

## 4.5 État actuel du dépôt
Le code initial couvre déjà la quasi-totalité du périmètre fonctionnel S0→S4 (voir README). Restent pour atteindre le MVP « public » :
- validation sur un corpus de replays réels (build courant) ;
- packaging Windows (PyInstaller + electron-builder) ;
- calibrage des timings de cartes et des seuils du HEROS SCORE ;
- migrations Alembic (le MVP utilise `create_all`) ;
- tests E2E Playwright de l'UI.

## 4.6 Risques

| Risque | Impact | Mitigation |
|---|---|---|
| Nouveau build HotS non supporté par heroprotocol | Import en échec | Repli sur le protocole connu le plus proche (implémenté) + veille du dépôt Blizzard/heroprotocol |
| Interprétation Blizzard d'une fonctionnalité | Bannissement / retrait | Matrice de conformité, sources déclarées, demande de validation, fonctions sensibles opt-in |
| Timings de cartes faux | Perte de confiance | Mention « estimation », recalage manuel, calibrage automatique |
| Coût Claude | Marge | Prompt système en cache, effort `medium`, rapport généré à la demande, contexte compact |
| Overlay invisible en plein écran exclusif | Support | Onboarding : « Plein écran fenêtré » obligatoire |
