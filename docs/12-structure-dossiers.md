# 12. Structure des dossiers

```
HOTS-REVIVAL/
├── README.md                     # présentation, démarrage rapide
├── docker-compose.yml            # PostgreSQL de développement
├── docs/                         # livrables d'architecture (ce dossier)
│
├── backend/                      # API locale Python / FastAPI
│   ├── pyproject.toml
│   ├── .env.example
│   ├── run.py                    # entrée de l'exécutable PyInstaller
│   ├── app/
│   │   ├── main.py               # create_app(), lifespan (watchers), routes
│   │   ├── config.py             # Settings (HOTS_*), détection du dossier replays
│   │   ├── db.py · models.py     # SQLAlchemy 2 (PostgreSQL / SQLite)
│   │   ├── schemas.py            # modèles Pydantic de l'API
│   │   ├── reference.py          # référentiel héros / cartes (normalisation FR/EN/interne)
│   │   ├── events.py             # diffusion WebSocket thread-safe
│   │   ├── observability.py      # Sentry, PostHog (opt-in)
│   │   ├── data/
│   │   │   ├── heroes.json       # 90 héros : rôle, tags, courbe de puissance
│   │   │   └── maps.json         # cartes : objectifs, timings, conseils
│   │   ├── replay/
│   │   │   ├── protocol.py       # chargement heroprotocol (sans `imp`)
│   │   │   ├── parser.py         # lecture MPQ (pas de game events)
│   │   │   ├── extractor.py      # RawReplay → ParsedMatch (pur)
│   │   │   ├── importer.py       # persistance + score + rapport
│   │   │   └── watcher.py        # surveillance du dossier
│   │   ├── analytics/
│   │   │   ├── heros_score.py    # HEROS SCORE
│   │   │   ├── profile_stats.py  # profil, progression, talents
│   │   │   └── report.py         # faits du rapport post-partie
│   │   ├── draft/engine.py       # Draft Assistant
│   │   ├── live/
│   │   │   ├── compliance.py     # sources autorisées / interdits
│   │   │   ├── battlelobby.py    # détection de lancement
│   │   │   └── session.py        # état live + calcul de l'overlay
│   │   ├── coach/
│   │   │   ├── prompts.py · context.py · client.py
│   │   └── api/                  # routes : reference, profile, matches, replays, draft, coach, live
│   ├── scripts/
│   │   ├── export_schema.py      # génère sql/schema.sql
│   │   └── seed_demo.py          # données de démonstration
│   ├── sql/schema.sql            # DDL PostgreSQL généré
│   └── tests/                    # pytest (extracteur, score, draft, live, API, conformité)
│
└── apps/desktop/                 # Electron + React + TypeScript + Tailwind
    ├── package.json · vite.config.mts · tailwind.config.cjs · tsconfig*.json
    ├── index.html                # CSP stricte
    ├── electron/
    │   ├── main.ts               # fenêtres, IPC, Sentry
    │   ├── backend.ts            # lancement du sidecar
    │   ├── overlay.ts            # fenêtre transparente click-through
    │   ├── shortcuts.ts          # raccourcis globaux (overlay uniquement)
    │   └── preload.ts            # pont window.hots
    └── src/
        ├── main.tsx · App.tsx · index.css
        ├── lib/                  # api.ts, types.ts, format.ts, analytics.ts, bridge.ts
        ├── hooks/                # useAsync, useLive (WebSocket)
        ├── components/           # Layout, ui, ScoreRadar, HeroSelect, Markdown, OverlayPanel
        └── pages/                # Dashboard, Matches, MatchReport, Draft, Coach, LiveControl, Overlay, Settings
```
