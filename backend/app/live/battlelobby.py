"""Détection du lancement d'une partie via le fichier battlelobby.

Au début de l'écran de chargement, le jeu écrit `replay.server.battlelobby` dans
%TEMP%\\Heroes of the Storm\\TempWriteReplayP*\\. On y lit uniquement ce que l'écran
de chargement affiche déjà : les BattleTags et la carte. La carte est identifiée par
le dernier fichier `.s2ma` (cache Battle.net) de la liste des dépendances :
  1. si cette empreinte a déjà été associée à une carte (apprise à la fin d'une partie
     précédente grâce au replay), on la reconnaît immédiatement ;
  2. sinon on lit l'identifiant de carte dans le fichier .s2ma du cache Battle.net local.
Aucune autre donnée temps réel n'est lue.
"""
from __future__ import annotations

import json
import logging
import os
import re
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from app.config import data_dir
from app.reference import registry

log = logging.getLogger(__name__)

BATTLELOBBY_NAME = "replay.server.battlelobby"
_BATTLETAG_RE = re.compile(rb"([A-Za-z\xc0-\xff][\w\x80-\xff]{1,15})#(\d{3,7})")
_CACHE_PATH_RE = re.compile(
    rb"([\x20-\x7e]*?Cache[\\/]([0-9a-f]{2})[\\/]([0-9a-f]{2})[\\/]([0-9a-f]{64})\.s2ma)"
)
_MAP_STRING_ID_RE = re.compile(r'mAPMapStringID\s*=\s*"([^"]+)"', re.IGNORECASE)
_DOC_NAME_RE = re.compile(r"^DocInfo/Name=(.+)$", re.MULTILINE)
_SCRIPT_NAME_RE = re.compile(r"^//\s*Name:\s*(.+?)\s*$", re.MULTILINE)
_ICON_NAME_RE = re.compile(r"MapSelect_(\w+?)\.png", re.IGNORECASE)
_IGNORED_TAG_NAMES = {"blizzmaps"}


@dataclass
class LobbyInfo:
    battletags: list[str] = field(default_factory=list)
    map_hash: str | None = None
    map_cache_path: str | None = None
    map_id: str | None = None
    map_source: str | None = None  # "appris" | "cache Battle.net"
    age_s: float = 0.0  # ancienneté du fichier (partie déjà en cours au démarrage)


def extract_battletags(data: bytes) -> list[str]:
    seen: list[str] = []
    for name, digits in _BATTLETAG_RE.findall(data):
        decoded = name.decode("utf-8", errors="ignore")
        if decoded.lower() in _IGNORED_TAG_NAMES:
            continue
        tag = f"{decoded}#{digits.decode()}"
        if tag not in seen:
            seen.append(tag)
    return seen[:10]


def parse_lobby(data: bytes) -> LobbyInfo:
    info = LobbyInfo(battletags=extract_battletags(data))
    paths = _CACHE_PATH_RE.findall(data)
    if paths:  # la dernière dépendance est la carte elle-même
        full, _a, _b, digest = paths[-1]
        info.map_hash = digest.decode()
        info.map_cache_path = full.decode("ascii", errors="ignore").strip()
    return info


# ---- apprentissage empreinte -> carte -------------------------------------------------

_learned_lock = threading.Lock()


def _learned_path() -> Path:
    return data_dir() / "map_hashes.json"


def learned_maps() -> dict[str, str]:
    try:
        return json.loads(_learned_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def learn_map(map_hash: str, map_id: str) -> None:
    if map_id not in registry().maps:
        return
    with _learned_lock:
        known = learned_maps()
        if known.get(map_hash) != map_id:
            known[map_hash] = map_id
            _learned_path().write_text(json.dumps(known, indent=1), encoding="utf-8")


# ---- lecture du fichier de carte dans le cache Battle.net ------------------------------

def _cache_candidates(info: LobbyInfo) -> list[Path]:
    out: list[Path] = []
    if info.map_cache_path:
        out.append(Path(info.map_cache_path))
    if info.map_hash:
        h = info.map_hash
        roots = [os.environ.get("PROGRAMDATA", r"C:\ProgramData") + r"\Blizzard Entertainment\Battle.net\Cache",
                 "/Users/Shared/Blizzard/Battle.net/Cache"]
        out += [Path(root) / h[:2] / h[2:4] / f"{h}.s2ma" for root in roots]
    return out


def _read_map_names_from_s2ma(path: Path) -> list[str]:
    """Noms possibles de la carte, du plus fiable au moins fiable. L'identifiant interne
    (mAPMapStringID) est parfois un nom de code (« Crypts » pour Tomb of the Spider Queen) :
    on essaie donc aussi le nom en tête du script, le nom localisé et l'icône de sélection."""
    import mpyq

    archive = mpyq.MPQArchive(str(path), listfile=False)
    names: list[str] = []
    script = archive.read_file("MapScript.galaxy")
    if script:
        text = script.decode("utf-8", errors="ignore")
        if m := _SCRIPT_NAME_RE.search(text):
            names.append(m.group(1).strip())
        if m := _MAP_STRING_ID_RE.search(text):
            names.append(m.group(1))
    for locale in ("enUS", "frFR"):
        strings = archive.read_file(f"{locale}.StormData\\LocalizedData\\GameStrings.txt")
        if strings and (m := _DOC_NAME_RE.search(strings.decode("utf-8", errors="ignore"))):
            names.append(m.group(1).strip())
    doc = archive.read_file("DocumentInfo")
    if doc and (m := _ICON_NAME_RE.search(doc.decode("utf-8", errors="ignore"))):
        names.append(re.sub(r"(?<=[a-z])(?=[A-Z])", " ", m.group(1)))  # TombOfTheSpiderQueen
    return names


def resolve_lobby_map(info: LobbyInfo) -> LobbyInfo:
    if not info.map_hash:
        return info
    known = learned_maps().get(info.map_hash)
    if known:
        info.map_id, info.map_source = known, "appris"
        return info
    for candidate in _cache_candidates(info):
        try:
            if not candidate.is_file():
                continue
            names = _read_map_names_from_s2ma(candidate)
        except Exception:  # format de cache inattendu : on retombe sur l'apprentissage
            log.debug("Lecture impossible de %s", candidate, exc_info=True)
            continue
        guessed = next((g for g in map(registry().guess_map, names) if g), None)
        if not guessed:
            log.warning("Carte non reconnue dans le cache : %s", names)
        if guessed:
            info.map_id, info.map_source = guessed.id, "cache Battle.net"
            learn_map(info.map_hash, guessed.id)
            return info
    return info


def read_lobby_file(path: Path) -> LobbyInfo:
    try:
        data = path.read_bytes()
    except OSError:
        return LobbyInfo()
    return resolve_lobby_map(parse_lobby(data))


# ---- surveillance ----------------------------------------------------------------------
# Vérification périodique plutôt qu'une surveillance de dossier : le jeu supprime et
# recrée %TEMP%\Heroes of the Storm, ce qui casse une surveillance classique.

def find_lobby_files(temp_dir: Path) -> list[Path]:
    if not temp_dir.is_dir():
        return []
    # pas de recherche récursive (appelée chaque seconde) : le fichier est toujours
    # dans TempWriteReplayP*\ directement sous le dossier temporaire du jeu
    found = list(temp_dir.glob(f"*/{BATTLELOBBY_NAME}")) + list(temp_dir.glob(BATTLELOBBY_NAME))
    return [p for p in found if p.is_file()]


class LobbyWatcher:
    def __init__(self, temp_dir: Path, on_lobby: Callable[[LobbyInfo], None], interval_s: float = 1.0) -> None:
        self.temp_dir = temp_dir
        self.on_lobby = on_lobby
        self.interval_s = interval_s
        self._stop = threading.Event()
        self._seen: set[tuple[str, float]] = set()
        self._pending: dict[str, tuple[float, int]] = {}

    def prime(self) -> None:
        """Ignore les fichiers déjà présents au démarrage (partie précédente)."""
        for p in find_lobby_files(self.temp_dir):
            try:
                self._seen.add((str(p), p.stat().st_mtime))
            except OSError:
                pass

    def in_progress(self, max_age_s: float = 2700, ended_after: float | None = None) -> LobbyInfo | None:
        """Partie déjà en cours (application lancée ou mise à jour en pleine partie) :
        fichier de chargement récent et aucun replay enregistré depuis."""
        import time

        files = []
        for p in find_lobby_files(self.temp_dir):
            try:
                files.append((p.stat().st_mtime, p))
            except OSError:
                pass
        if not files:
            return None
        mtime, path = max(files)
        age = time.time() - mtime
        if age > max_age_s or (ended_after is not None and ended_after >= mtime):
            return None
        info = read_lobby_file(path)
        if not (info.battletags or info.map_hash):
            return None
        self._seen.add((str(path), mtime))
        info.age_s = max(0.0, age)
        return info

    def poll(self) -> LobbyInfo | None:
        for p in find_lobby_files(self.temp_dir):
            try:
                st = p.stat()
            except OSError:
                continue
            key = (str(p), st.st_mtime)
            if key in self._seen:
                continue
            # attendre une taille stable (fichier en cours d'écriture)
            if self._pending.get(str(p)) != (st.st_mtime, st.st_size):
                self._pending[str(p)] = (st.st_mtime, st.st_size)
                continue
            self._seen.add(key)
            info = read_lobby_file(p)
            if info.battletags or info.map_hash:
                self.on_lobby(info)
                return info
        return None

    def _loop(self) -> None:
        self.prime()
        while not self._stop.is_set():
            try:
                self.poll()
            except Exception:
                log.debug("Lecture du fichier de chargement impossible", exc_info=True)
            self._stop.wait(self.interval_s)

    def start(self) -> None:
        threading.Thread(target=self._loop, daemon=True, name="lobby-watcher").start()
        log.info("Détection de partie : %s", self.temp_dir)

    def stop(self) -> None:
        self._stop.set()
