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
| Prod (MVP) | exécutable PyInstaller lancé par Electron | PostgreSQL local *ou* SQLite embarqué (choix d'installation) | clé utilisateur (MVP) → proxy cloud (V2) |

> Note MVP : imposer PostgreSQL à un joueur est lourd. L'ORM est compatible SQLite ; l'installateur peut utiliser `sqlite:///%APPDATA%/HOTS REVIVAL/hots.db` par défaut et PostgreSQL pour le mode cloud/équipe.

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

## 11.5 Packaging Windows
```bash
# backend → backend/dist/hots-backend/hots-backend.exe
cd backend
pyinstaller run.py --name hots-backend --onedir --noconfirm \
  --collect-all heroprotocol --add-data "app/data;app/data"
# desktop → apps/desktop/release/HOTS REVIVAL Setup x.y.z.exe
cd ../apps/desktop && npm run dist
```
Points à valider en S4 : chargement des modules `protocolNNNNN.py` dans l'exécutable figé (`--collect-all heroprotocol`), signature de code, antivirus (faux positifs PyInstaller).

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
