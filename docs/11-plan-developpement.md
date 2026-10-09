# 11. Plan de développement

## 11.1 Organisation
- **Monorepo** : `backend/` (Python) + `apps/desktop/` (Electron/React) + `docs/`.
- **Branches** : `main` protégée ; branches de fonctionnalité `feat/US-xxx-…` ; PR obligatoire avec revue + CI verte.
- **Definition of Done** : critères d'acceptation remplis, tests unitaires, typecheck, test de conformité vert, docs mises à jour si API/schéma modifiés.

## 11.2 Environnements
| Env | Backend | Base | IA |
|---|---|---|---|
| Dev | `uvicorn --reload` | PostgreSQL docker ou SQLite | clé développeur |
| Test/CI | TestClient | SQLite mémoire | désactivée (repli déterministe) |
| Prod (MVP) | exécutable PyInstaller lancé par Electron | SQLite dans `%APPDATA%\\HOTS REVIVAL` | clé saisie dans Paramètres (MVP) → proxy cloud (V2) |

> L'application installée utilise SQLite (aucune installation de base de données). PostgreSQL reste disponible via `HOTS_DATABASE_URL` pour le mode serveur/équipe et la V2 cloud.

## 11.3 CI (GitHub Actions, à ajouter en S0)
1. `backend` : `pip install -e .[dev]` → `pytest` (inclut `test_compliance.py`).
2. `desktop` : `npm ci` → `npm run typecheck` → `npm run build`.
3. Release (tag) : runner Windows → `pyinstaller` backend → `npm run dist` → artefact NSIS.

## 11.4 Stratégie de tests
| Niveau | Outil | Couverture |
|---|---|---|
| Unitaires purs | pytest | extracteur (replay synthétique), HEROS SCORE, draft, session live, battlelobby |
| API | FastAPI TestClient | import → parties → rapport → profil → talents, draft, coach (SSE), live |
| Conformité | pytest | scan d'API interdites dans tout le code |
| Corpus réel | pytest marqué `@slow` | dossier de replays réels anonymisés (à constituer) |
| E2E UI | Playwright | parcours Dashboard → Rapport → Coach ; overlay |
| Manuel | — | partie réelle avec overlay (FPS, lisibilité, raccourcis) |

## 11.5 Packaging Windows (installeur double-clic)
Entièrement automatisé par `.github/workflows/windows-installer.yml` (runner `windows-latest`) :
1. tests backend + typecheck desktop (Ubuntu) ;
2. `pyinstaller backend/hots-backend.spec` → `backend/dist/hots-backend/hots-backend.exe` (sans console ; les sources des protocoles heroprotocol sont embarquées en données) ;
3. test de fumée : l'exécutable démarre et `/api/health/replay-parser` confirme le chargement des protocoles ;
4. `npm run dist` → `apps/desktop/release/HOTS-REVIVAL-Setup-x.y.z.exe` (NSIS « one-click », installation par utilisateur, raccourcis Bureau/Menu Démarrer, lancement automatique) ;
5. publication dans les Releases GitHub (pré-version pour chaque push, version stable pour un tag `v*`).

Au lancement, Electron démarre le moteur (`HOTS_DATA_DIR=%APPDATA%\HOTS REVIVAL`), affiche un écran d'attente jusqu'à ce que `/api/health` réponde, puis charge l'interface. Une seule instance est autorisée. La base SQLite, `settings.json` (réglages saisis dans l'interface) et `backend.log` vivent dans ce dossier.

Restant à faire : certificat de signature de code (SmartScreen), mise à jour automatique (electron-updater), polices embarquées pour le mode hors ligne.

## 11.6 Jalons détaillés (30 jours)
| Jour | Tâches |
|---|---|
| J1 | Repo, CI, docker-compose, conventions |
| J2 | Squelettes FastAPI/Electron/React, thème Tailwind |
| J3–J4 | Chargement protocole, parser MPQ, extracteur + tests synthétiques |
| J5 | Modèle de données, import + déduplication |
| J6 | Watcher + rattrapage + notification WebSocket |
| J7–J8 | Validation sur 50 replays réels, gestion des erreurs, liste des parties |
| J9 | Revue sprint, correctifs |
| J10–J11 | Profil (winrates, tendances, meilleurs/pires héros) + Dashboard |
| J12–J13 | HEROS SCORE v1 + radar + tests |
| J14–J15 | Faits du rapport, écran rapport, tableau des scores |
| J16 | Revue sprint |
| J17–J18 | Client Claude, contexte joueur, chat SSE |
| J19 | Résumé IA structuré + repli |
| J20–J22 | Moteur de draft, recommandations, écran Draft |
| J23 | Revue sprint, revue des réponses du coach (30 cas) |
| J24 | Fenêtre overlay, click-through, raccourcis |
| J25 | Session live, timers, powerspikes, conseils |
| J26 | battlelobby, build de talents |
| J27 | Calibrage timings sur replays, polish overlay |
| J28 | Test en partie réelle, perf |
| J29 | PyInstaller + NSIS, onboarding |
| J30 | Tests utilisateurs, correctifs, release 0.1.0 |

## 11.7 Conventions de code
- Python : typage complet, fonctions pures pour l'analyse, `ruff` + `mypy` (à ajouter).
- TypeScript : `strict`, pas de `any`, composants fonctionnels, appels API centralisés dans `src/lib/api.ts`.
- Textes UI et prompts en français ; identifiants de code en anglais.
