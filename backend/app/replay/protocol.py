"""Chargement des modules de protocole officiels Blizzard (heroprotocol).

heroprotocol utilise le module `imp`, supprimé en Python 3.12 : on charge donc
les fichiers `protocolNNNNN.py` directement via importlib.
"""
from __future__ import annotations

import importlib.util
import logging
import re
import sys
from functools import lru_cache
from pathlib import Path
from types import ModuleType

log = logging.getLogger(__name__)

_PROTOCOL_RE = re.compile(r"protocol(\d+)\.py$")


def _versions_dir() -> Path:
    spec = importlib.util.find_spec("heroprotocol")
    if spec is None or spec.origin is None:
        raise RuntimeError("Le paquet 'heroprotocol' est introuvable (pip install heroprotocol).")
    return Path(spec.origin).parent / "versions"


@lru_cache
def available_builds() -> tuple[int, ...]:
    builds = []
    for f in _versions_dir().iterdir():
        m = _PROTOCOL_RE.match(f.name)
        if m:
            builds.append(int(m.group(1)))
    return tuple(sorted(builds))


@lru_cache
def load_protocol(build: int | None = None) -> ModuleType:
    """Charge le protocole d'un build. À défaut, le build connu le plus proche inférieur."""
    builds = available_builds()
    if not builds:
        raise RuntimeError("Aucun protocole heroprotocol disponible.")
    if build is None:
        chosen = builds[-1]
    elif build in builds:
        chosen = build
    else:
        lower = [b for b in builds if b < build]
        chosen = lower[-1] if lower else builds[0]
        log.warning("Protocole %s absent, utilisation de %s", build, chosen)

    name = f"heroprotocol.versions.protocol{chosen}"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, _versions_dir() / f"protocol{chosen}.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module
