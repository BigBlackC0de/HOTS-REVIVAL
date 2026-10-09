"""Configuration.

Priorité : variables d'environnement HOTS_* > réglages enregistrés depuis l'interface
(`<data_dir>/settings.json`) > valeurs par défaut. Aucun fichier à éditer à la main :
l'application installée fonctionne sans configuration (SQLite + dossier de replays détecté).
"""
from __future__ import annotations

import json
import os
import re
import sys
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import Request
from pydantic import AliasChoices, Field
from pydantic_settings import (
    BaseSettings,
    JsonConfigSettingsSource,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)

TOON_HANDLE_RE = re.compile(r"\d+-Hero-\d+-\d+")

# Réglages modifiables depuis l'écran Paramètres (persistés dans settings.json).
USER_EDITABLE = ("replay_dir", "player_battletag", "player_toon_handle", "anthropic_api_key", "claude_model")


def data_dir() -> Path:
    """Dossier des données utilisateur (base, réglages, journaux)."""
    if os.environ.get("HOTS_DATA_DIR"):
        path = Path(os.environ["HOTS_DATA_DIR"])
    elif sys.platform == "win32" and os.environ.get("APPDATA"):
        path = Path(os.environ["APPDATA"]) / "HOTS REVIVAL"
    else:
        path = Path.home() / ".hots-revival"
    path.mkdir(parents=True, exist_ok=True)
    return path


def user_settings_path() -> Path:
    return data_dir() / "settings.json"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="HOTS_", env_file=".env", env_ignore_empty=True, extra="ignore")

    # Vide = SQLite dans le dossier de données (mode installé). PostgreSQL possible
    # via HOTS_DATABASE_URL=postgresql+psycopg://… (mode serveur / équipe).
    database_url: str = ""
    replay_dir: str = ""
    player_battletag: str = ""
    player_toon_handle: str = ""
    watch_replays: bool = True
    watch_live: bool = True
    # Dossier temporaire où le jeu écrit replay.server.battlelobby au chargement.
    live_temp_dir: str = ""

    anthropic_api_key: str = Field(
        default="", validation_alias=AliasChoices("ANTHROPIC_API_KEY", "anthropic_api_key")
    )
    claude_model: str = "claude-opus-5-5"
    claude_effort: str = "medium"

    sentry_dsn: str = ""
    posthog_key: str = ""
    posthog_host: str = "https://eu.i.posthog.com"

    cors_origins: list[str] = ["http://localhost:5173", "app://hots-revival"]

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        json_source = JsonConfigSettingsSource(settings_cls, json_file=user_settings_path())
        return init_settings, env_settings, dotenv_settings, json_source, file_secret_settings

    def resolved_database_url(self) -> str:
        return self.database_url or f"sqlite:///{(data_dir() / 'hots.db').as_posix()}"

    def resolved_replay_dirs(self) -> list[Path]:
        """Tous les dossiers de replays du joueur (chaque région / compte présent sur le PC)."""
        if self.replay_dir:
            chosen = Path(self.replay_dir)
            dirs = [chosen]
            # dossier standard : on ajoute les autres régions du même dossier Accounts
            if TOON_HANDLE_RE.search(str(chosen)) and len(chosen.parents) >= 4:
                accounts = chosen.parents[3]
                dirs += [d for d in _multiplayer_dirs(accounts) if d != chosen]
            return dirs
        return discover_replay_dirs()

    def resolved_replay_dir(self) -> Path | None:
        dirs = self.resolved_replay_dirs()
        return dirs[0] if dirs else None

    def resolved_toon_handles(self) -> list[str]:
        handles = [h.strip() for h in self.player_toon_handle.split(",") if h.strip()]
        for d in self.resolved_replay_dirs():
            match = TOON_HANDLE_RE.search(str(d))
            if match and match.group(0) not in handles:
                handles.append(match.group(0))
        return handles

    def resolved_toon_handle(self) -> str | None:
        handles = self.resolved_toon_handles()
        return handles[0] if handles else None

    def resolved_live_dir(self) -> Path:
        if self.live_temp_dir:
            return Path(self.live_temp_dir)
        temp = os.environ.get("TEMP") or os.environ.get("TMPDIR") or "/tmp"
        return Path(temp) / "Heroes of the Storm"


def _multiplayer_dirs(accounts: Path) -> list[Path]:
    if not accounts.is_dir():
        return []
    return sorted(accounts.glob("*/*-Hero-*/Replays/Multiplayer"), key=lambda p: p.stat().st_mtime, reverse=True)


def discover_replay_dirs() -> list[Path]:
    """Documents/Heroes of the Storm/Accounts/<id>/<toon>/Replays/Multiplayer (toutes régions)."""
    homes = [Path.home() / "Documents", Path.home() / "OneDrive" / "Documents"]
    for docs in homes:
        dirs = _multiplayer_dirs(docs / "Heroes of the Storm" / "Accounts")
        if dirs:
            return dirs
    return []


def discover_replay_dir() -> Path | None:
    dirs = discover_replay_dirs()
    return dirs[0] if dirs else None


def read_user_settings() -> dict[str, Any]:
    try:
        return json.loads(user_settings_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def write_user_settings(values: dict[str, Any]) -> None:
    current = read_user_settings()
    current.update({k: v for k, v in values.items() if k in USER_EDITABLE})
    path = user_settings_path()
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(current, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


@lru_cache
def get_settings() -> Settings:
    return Settings()


def app_settings(request: Request) -> Settings:
    """Dépendance FastAPI : paramètres de l'application courante."""
    return getattr(request.app.state, "settings", None) or get_settings()
