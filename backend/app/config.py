from __future__ import annotations

import os
import re
from functools import lru_cache
from pathlib import Path

from fastapi import Request
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

TOON_HANDLE_RE = re.compile(r"\d+-Hero-\d+-\d+")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="HOTS_", env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://hots:hots@localhost:5432/hots_revival"
    replay_dir: str = ""
    player_battletag: str = ""
    player_toon_handle: str = ""
    watch_replays: bool = True
    watch_live: bool = True
    # Dossier temporaire où le jeu écrit replay.server.battlelobby au chargement.
    live_temp_dir: str = ""

    anthropic_api_key: str = Field(default="", validation_alias="ANTHROPIC_API_KEY")
    claude_model: str = "claude-opus-5-5"
    claude_effort: str = "medium"

    sentry_dsn: str = ""
    posthog_key: str = ""
    posthog_host: str = "https://eu.i.posthog.com"

    cors_origins: list[str] = ["http://localhost:5173", "app://hots-revival"]

    def resolved_replay_dir(self) -> Path | None:
        if self.replay_dir:
            return Path(self.replay_dir)
        return discover_replay_dir()

    def resolved_toon_handle(self) -> str | None:
        if self.player_toon_handle:
            return self.player_toon_handle
        replay_dir = self.resolved_replay_dir()
        if replay_dir:
            match = TOON_HANDLE_RE.search(str(replay_dir))
            if match:
                return match.group(0)
        return None

    def resolved_live_dir(self) -> Path:
        if self.live_temp_dir:
            return Path(self.live_temp_dir)
        temp = os.environ.get("TEMP") or os.environ.get("TMPDIR") or "/tmp"
        return Path(temp) / "Heroes of the Storm"


def discover_replay_dir() -> Path | None:
    """Cherche Documents/Heroes of the Storm/Accounts/<id>/<toon>/Replays/Multiplayer."""
    accounts = Path.home() / "Documents" / "Heroes of the Storm" / "Accounts"
    if not accounts.is_dir():
        return None
    candidates = sorted(accounts.glob("*/*-Hero-*/Replays/Multiplayer"))
    return candidates[0] if candidates else None


@lru_cache
def get_settings() -> Settings:
    return Settings()


def app_settings(request: Request) -> Settings:
    """Dépendance FastAPI : paramètres de l'application courante."""
    return getattr(request.app.state, "settings", None) or get_settings()
