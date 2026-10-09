# 8. Backlog complet & user stories

Légende — Priorité : **M** Must (MVP), **S** Should, **C** Could, **W** Won't now (V2+). Estimation en points (1, 2, 3, 5, 8). Statut : ✅ présent dans le code initial · 🟡 partiel · ⬜ à faire.

## Personas
- **Léa, joueuse Storm League Diamant** — veut comprendre ses défaites et progresser vite.
- **Karim, joueur Quick Match occasionnel** — veut de l'aide en draft et en jeu sans effort.
- **Nora, capitaine d'équipe amateur** — veut analyser les parties de son équipe (V2).

---

## E1 — Import & parsing des replays
| ID | User story | Critères d'acceptation | Prio | Pts | Statut |
|---|---|---|---|---|---|
| US-101 | En tant que joueur, je veux que mes replays soient importés automatiquement à la fin de chaque partie, pour ne rien avoir à faire. | Nouveau `.StormReplay` détecté < 5 s ; import après taille stable ; notification UI | M | 5 | ✅ |
| US-102 | En tant que joueur, je veux importer mes anciens replays, pour avoir un historique dès l'installation. | Scan du dossier au démarrage + bouton « Importer » (fichier ou dossier) ; doublons ignorés | M | 3 | ✅ |
| US-103 | En tant que joueur, je veux que le dossier soit détecté sans configuration. | Recherche `Documents/Heroes of the Storm/Accounts/*/*-Hero-*/Replays/Multiplayer` ; surcharge `HOTS_REPLAY_DIR` | M | 2 | ✅ |
| US-104 | En tant que système, je dois extraire stats de fin de partie, talents, morts, niveaux, camps, objectifs. | Tests sur replay synthétique + corpus réel de 50 replays | M | 8 | 🟡 (corpus réel à valider) |
| US-105 | En tant que joueur, je veux être reconnu automatiquement dans mes parties. | `is_me` via toon handle du chemin ou configuration | M | 2 | ✅ |
| US-106 | En tant que système, je dois supporter un build HotS inconnu. | Repli sur le protocole connu le plus proche + journalisation | M | 2 | ✅ |
| US-107 | En tant que joueur, je veux voir les replays en échec et pourquoi. | Statut `failed` + message ; écran Paramètres | S | 2 | 🟡 |
| US-108 | Noms de talents lisibles (et non internes). | Catalogue talents (données publiques) FR/EN | S | 5 | ⬜ |

## E2 — Profil joueur
| ID | User story | Critères | Prio | Pts | Statut |
|---|---|---|---|---|---|
| US-201 | Voir mon winrate global, par rôle et par héros. | Valeurs exactes vs requêtes SQL de contrôle | M | 3 | ✅ |
| US-202 | Connaître mon meilleur et mon pire héros. | Lissage bayésien, min. 3 parties | M | 2 | ✅ |
| US-203 | Connaître mes rôles principal et secondaire. | Basé sur le volume de parties | M | 1 | ✅ |
| US-204 | Savoir quels héros éviter. | Winrate lissé < 45 % sur ≥ 3 parties | M | 1 | ✅ |
| US-205 | Voir ma tendance et ma progression. | 10 dernières vs 10 précédentes ; courbe HEROS SCORE | M | 3 | ✅ |
| US-206 | Renseigner mon BattleTag et mon rang. | Écran Paramètres éditable, persistant | S | 2 | 🟡 (via .env) |
| US-207 | Filtrer par mode de jeu, saison, carte. | Filtres sur Dashboard et Parties | S | 3 | ⬜ |

## E3 — HEROS SCORE
| ID | User story | Critères | Prio | Pts | Statut |
|---|---|---|---|---|---|
| US-301 | Obtenir une note sur 100 après chaque partie. | 6 catégories + global, 0–100, version d'algorithme | M | 5 | ✅ |
| US-302 | Comprendre ma note. | Détail des composantes affiché (tooltip) | S | 3 | 🟡 (API ok, UI à faire) |
| US-303 | Comparer ma note à celle des autres joueurs de la partie. | Score des 10 joueurs dans le tableau | M | 1 | ✅ |
| US-304 | Note calibrée par rôle et par rang. | Seuils recalculés sur ≥ 5 000 lignes | C | 8 | ⬜ |

## E4 — Rapport post-partie
| ID | User story | Critères | Prio | Pts | Statut |
|---|---|---|---|---|---|
| US-401 | Recevoir automatiquement un rapport à la fin de la partie. | Faits déterministes générés à l'import | M | 5 | ✅ |
| US-402 | Lire un résumé rédigé par l'IA (résumé, forces, faiblesses, moments clés, erreurs, actions excellentes, plan). | Sortie structurée validée ; repli sans clé | M | 5 | ✅ |
| US-403 | Voir la chronologie de la partie (morts, niveaux 10/16/20, wipes). | Moments clés horodatés | M | 3 | ✅ |
| US-404 | Exporter / partager mon rapport. | Image PNG ou lien | C | 5 | ⬜ |

## E5 — Coach IA
| ID | User story | Critères | Prio | Pts | Statut |
|---|---|---|---|---|---|
| US-501 | Poser « Pourquoi ai-je perdu ? » sur une partie. | Réponse en streaming citant les faits du match | M | 5 | ✅ |
| US-502 | Questions rapides prédéfinies. | 5 boutons (perdu, gagné, améliorer, morts, positionnement) | M | 1 | ✅ |
| US-503 | Coach qui connaît mon historique. | Contexte : profil, héros, 8 dernières parties | M | 3 | ✅ |
| US-504 | Ton professionnel, pédagogique, jamais toxique. | Prompt système + revue de 30 réponses | M | 2 | ✅ |
| US-505 | Reprendre une conversation. | Historique persistant | S | 2 | 🟡 (API ok, liste UI à faire) |
| US-506 | Objectifs suivis sur plusieurs parties. | Coach rappelle l'objectif et mesure | W | 8 | ⬜ |

## E6 — Draft Assistant
| ID | User story | Critères | Prio | Pts | Statut |
|---|---|---|---|---|---|
| US-601 | Saisir alliés, adversaires, bans, carte. | Sélecteurs par rôle, héros déjà pris masqués | M | 3 | ✅ |
| US-602 | Voir forces, faiblesses, synergies, menaces, win conditions. | Mise à jour < 300 ms à chaque pick | M | 5 | ✅ |
| US-603 | Recevoir des picks recommandés tenant compte de mes winrates. | Top 5, clic = ajout | M | 3 | ✅ |
| US-604 | Estimation early / mid / late. | 3 jauges | M | 2 | ✅ |
| US-605 | Explication IA de la draft. | Bouton « Analyse Claude » | S | 3 | ⬜ |
| US-606 | Statistiques globales de matchups. | Données cloud agrégées | W | 8 | ⬜ |

## E7 — Overlay temps réel
| ID | User story | Critères | Prio | Pts | Statut |
|---|---|---|---|---|---|
| US-701 | Overlay léger visible pendant la partie. | Transparent, click-through, toujours au premier plan, < 1 % CPU | M | 5 | ✅ |
| US-702 | Timer du prochain objectif et priorité. | Basé sur l'horloge synchronisée ; mention « estimation » | M | 3 | ✅ |
| US-703 | Timers de camps. | Démarrage manuel par type, alerte 20 s | M | 2 | ✅ |
| US-704 | Alertes powerspike (10/16/20, avantage de talent). | Saisie des niveaux par raccourcis | M | 3 | ✅ |
| US-705 | Build de talents recommandé, alternatives, winrate, popularité. | Depuis les replays importés | M | 3 | ✅ |
| US-706 | Détection automatique du lancement de partie. | battlelobby → statut « chargement » | M | 2 | ✅ |
| US-707 | Raccourcis reconfigurables. | Écran Paramètres | S | 3 | ⬜ |
| US-708 | Position et taille de l'overlay ajustables. | Glisser en mode interactif, persistance | S | 3 | ⬜ |
| US-709 | Lecture opt-in de l'horloge et des niveaux (OCR). | Conforme §2.4 | W | 8 | ⬜ |

## E8 — Plateforme, conformité, qualité
| ID | User story | Critères | Prio | Pts | Statut |
|---|---|---|---|---|---|
| US-801 | En tant qu'éditeur, je dois garantir l'absence d'API interdites. | Test de conformité bloquant en CI | M | 2 | ✅ |
| US-802 | Installer l'application en un clic sous Windows. | NSIS, backend embarqué (PyInstaller) | M | 5 | 🟡 (config prête) |
| US-803 | Remontée des erreurs. | Sentry main + backend, opt-in | M | 2 | ✅ |
| US-804 | Mesure d'usage respectueuse. | PostHog, évènements explicites, opt-in | S | 2 | ✅ |
| US-805 | Migrations de schéma. | Alembic | S | 3 | ⬜ |
| US-806 | Tests E2E UI. | Playwright sur parcours principaux | S | 5 | ⬜ |
| US-807 | Mises à jour automatiques. | electron-updater | C | 3 | ⬜ |

## E9 — UX & design
| ID | User story | Critères | Prio | Pts | Statut |
|---|---|---|---|---|---|
| US-901 | Interface sombre aux couleurs HotS. | Bleu Heroes, violet Nexus, doré Blizzard | M | 3 | ✅ |
| US-902 | Onboarding premier lancement. | Dossier détecté, clé Claude, « plein écran fenêtré » | S | 3 | ⬜ |
| US-903 | Accessibilité. | Contrastes AA, navigation clavier | S | 3 | ⬜ |
| US-904 | Version anglaise. | i18n | C | 5 | ⬜ |
