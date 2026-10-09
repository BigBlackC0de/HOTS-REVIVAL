# 2. Contraintes et conformité Blizzard

> Ce document est une analyse de conception, pas un avis juridique. Les conditions d'utilisation Blizzard (EULA / « Blizzard End User License Agreement ») et la politique « Code of Conduct » évoluent : relire la version en vigueur avant chaque publication et, idéalement, demander une validation écrite à Blizzard avant la sortie publique.

## 2.1 Règle d'or
**HOTS REVIVAL n'interagit jamais avec le client du jeu.** C'est une application indépendante qui lit des fichiers que le jeu a déjà écrits sur le disque du joueur, affiche des informations publiques et reçoit des saisies volontaires du joueur.

## 2.2 Matrice de conformité

| Demande | Statut | Mise en œuvre |
|---|---|---|
| Injection dans le processus | ❌ Interdit | Aucun `OpenProcess`, DLL, hook. Vérifié par `tests/test_compliance.py` (liste `FORBIDDEN_CODE_TOKENS`). |
| Modification / lecture mémoire | ❌ Interdit | Idem. Aucune dépendance de type `pymem`, `frida`. |
| Cheat, scripts, macros, automatisation | ❌ Interdit | Aucun envoi d'entrées (`SendInput`, `robotjs`, `pyautogui` bannis). Les raccourcis globaux ne pilotent que l'overlay. |
| Informations cachées / fog of war | ❌ Interdit | Aucune position ennemie, aucun cooldown ennemi, aucune estimation du brouillard. |
| Décodage d'une partie **en cours** | ❌ Interdit (choix produit) | Les tracker events ne sont lus que dans les `.StormReplay` **terminés**. |
| Analyse des replays | ✅ | Bibliothèque officielle `heroprotocol`. Les *game events* (entrées clavier/souris) ne sont même pas décodés. |
| Overlay passif | ✅ | Fenêtre Electron séparée, click-through, non focusable. |
| Analyse de draft | ✅ | Uniquement les choix visibles par tous en draft + profils publics + historique personnel. |
| Statistiques, conseils IA, tracking, historique | ✅ | Calculés après la partie ou à partir de données publiques. |

## 2.3 Sources de données autorisées (déclarées dans le code)
Le module `backend/app/live/compliance.py` est la source de vérité, exposée par `GET /api/compliance` et affichée dans l'écran Paramètres :

| Source | Contenu | Moment |
|---|---|---|
| `replay_files` | `.StormReplay` terminés | Après la partie |
| `game_process` | Présence du processus du jeu dans la liste des programmes (lancé / fermé), comme Discord ; jamais ouvert ni lu | En continu |
| `battlelobby_file` | `replay.server.battlelobby` : joueurs et carte affichés à l'écran de chargement (carte via le fichier de carte du cache Battle.net, puis apprise) | Au chargement |
| `screen_reading` | **Option, désactivée par défaut** : OCR local de 3 zones publiques du HUD (horloge, niveau de chaque équipe), jamais la mini-carte, aucune image conservée | Pendant la partie |
| `public_websites` | Pages publiques Icy Veins (tier lists, guides), téléchargées hors partie, citées avec lien | Hors partie |
| `user_input` | Carte, horloge, niveaux d'équipe affichés en haut de l'écran, camps observés | Pendant la partie |
| `static_data` | Timings de carte, profils de héros, patch notes | Toujours |
| `own_history` | Historique et agrégats issus des replays importés | Toujours |

Chaque état d'overlay renvoyé par l'API porte le champ `sources` listant celles qu'il a utilisées.

## 2.4 Zones grises identifiées et position retenue

| Sujet | Analyse | Décision MVP |
|---|---|---|
| Fichier `battlelobby` | Fichier temporaire écrit par le jeu, contenant des données également visibles à l'écran de chargement. Usage historique d'outils communautaires (affichage des profils au chargement). | Utilisé **uniquement** comme signal « partie lancée » et liste de BattleTags. Désactivable (`HOTS_WATCH_LIVE=false`). Pas de lookup des adversaires dans le MVP. |
| Timers de camps adverses | Les camps capturés sont visibles sur la minimap ; deviner une capture non vue serait une information cachée. | Timer démarré **manuellement** par le joueur pour un camp qu'il a vu. Aucune inférence automatique. |
| Lecture d'écran (OCR) du HUD | Lecture des pixels déjà affichés (horloge, niveaux d'équipe) sans toucher au processus. Pratique courante des overlays, mais Blizzard peut l'apprécier différemment. | Implémentée en **option désactivée par défaut**, limitée à 3 zones publiques calibrées par le joueur, jamais la minimap, aucune image conservée. Validation Blizzard recommandée avant diffusion publique. |
| Contenu Icy Veins | Pages publiques consultées comme le ferait un navigateur, pour l'usage personnel du joueur. | Téléchargement espacé (une page à la fois, tier lists 1×/jour, guides 1×/semaine), source et lien affichés. Demander l'accord d'Icy Veins avant une diffusion large. |
| Statistiques des autres joueurs | Les replays contiennent les 10 joueurs. | Agrégats anonymisés (talents, héros). Pas de profilage nominatif d'autres joueurs dans le MVP. |
| Raccourcis globaux | Ils capturent une combinaison au niveau OS sans rien envoyer au jeu. | Autorisé ; combinaisons peu utilisées en jeu, reconfigurables (backlog). |

## 2.5 Garde-fous techniques
1. **Test de conformité** bloquant en CI : scan du code backend + Electron + React à la recherche d'API interdites.
2. **Test structurel** : `parser.py` ne doit pas appeler `decode_replay_game_events`.
3. **Overlay** : `setIgnoreMouseEvents(true)` par défaut, `focusable: false` → l'overlay ne peut pas capter le focus du jeu par accident.
4. **Prompt du coach** : interdiction explicite de prétendre connaître positions cachées, cooldowns adverses ou brouillard.
5. **Revue** : toute nouvelle source de données = ajout dans `ALLOWED_SOURCES` + revue conformité dans la PR.

## 2.6 Communication utilisateur
- Écran Paramètres → bloc « Conformité Blizzard » (sources utilisées / jamais).
- Mention permanente dans la barre latérale : « Overlay passif conforme : aucune lecture mémoire, aucune action automatique. »
- Le site et la page de téléchargement reprennent la matrice §2.2.
