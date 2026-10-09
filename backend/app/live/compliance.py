"""Garde-fous de conformité Blizzard.

HOTS REVIVAL n'interagit JAMAIS avec le processus du jeu. Toute donnée
utilisée par l'overlay doit provenir d'une des sources déclarées ci-dessous.
Ce module est la référence lue par l'UI (/api/compliance) et par les tests.
"""
from __future__ import annotations

ALLOWED_SOURCES: dict[str, str] = {
    "game_process": "Présence du processus HeroesOfTheStorm dans la liste des programmes (jeu lancé / fermé), "
                    "comme le fait Discord. Le processus n'est jamais ouvert ni lu.",
    "replay_files": "Fichiers .StormReplay terminés, écrits par le jeu dans Documents (analyse post-partie).",
    "battlelobby_file": "Fichier replay.server.battlelobby écrit par le jeu au chargement : uniquement les "
                        "informations affichées sur l'écran de chargement (joueurs, carte).",
    "user_input": "Saisies volontaires du joueur dans l'overlay (carte, synchronisation d'horloge, niveaux "
                  "d'équipe affichés en haut de l'écran, camps observés).",
    "static_data": "Données publiques : timings de carte, profils de héros, patch notes.",
    "own_history": "Historique de replays du joueur et statistiques agrégées dérivées.",
}

FORBIDDEN_CAPABILITIES: tuple[str, ...] = (
    "Lecture ou écriture de la mémoire du processus HeroesOfTheStorm",
    "Injection de DLL / hook DirectX / interception réseau",
    "Envoi d'entrées clavier/souris au jeu (macros, scripts, automatisation)",
    "Révélation du brouillard de guerre ou de positions ennemies invisibles",
    "Suivi des cooldowns ennemis non visibles",
    "Décodage des évènements de replay d'une partie en cours",
)

# Jetons interdits dans le code source (vérifiés par tests/test_compliance.py)
FORBIDDEN_CODE_TOKENS: tuple[str, ...] = (
    "ReadProcessMemory", "WriteProcessMemory", "OpenProcess", "CreateRemoteThread",
    "VirtualAllocEx", "SetWindowsHookEx", "SendInput", "keybd_event", "mouse_event",
    "pymem", "pywinauto", "pyautogui", "robotjs", "nut-js", "frida",
)


def describe() -> dict:
    return {
        "allowed_sources": ALLOWED_SOURCES,
        "forbidden": list(FORBIDDEN_CAPABILITIES),
        "statement": "Overlay passif : aucune lecture mémoire, aucune injection, aucune action automatique. "
                     "Seules les informations publiques ou personnelles sont utilisées.",
    }
