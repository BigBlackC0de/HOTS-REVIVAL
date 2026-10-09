"""Réglages modifiables depuis l'interface (aucun fichier à éditer)."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.config import Settings, app_settings, data_dir, get_settings, write_user_settings

router = APIRouter(prefix="/settings", tags=["paramètres"])


class SettingsOut(BaseModel):
    replay_dir: str
    replay_dir_detected: str | None
    replay_dir_exists: bool
    player_battletag: str
    player_toon_handle: str | None
    claude_model: str
    has_api_key: bool
    data_dir: str


class SettingsUpdate(BaseModel):
    replay_dir: str | None = None
    player_battletag: str | None = Field(None, max_length=80)
    anthropic_api_key: str | None = Field(None, max_length=300)
    claude_model: str | None = Field(None, max_length=64)


def _out(s: Settings) -> SettingsOut:
    folder = s.resolved_replay_dir()
    return SettingsOut(
        replay_dir=s.replay_dir,
        replay_dir_detected=str(folder) if folder else None,
        replay_dir_exists=bool(folder and folder.is_dir()),
        player_battletag=s.player_battletag,
        player_toon_handle=s.resolved_toon_handle(),
        claude_model=s.claude_model,
        has_api_key=bool(s.anthropic_api_key),
        data_dir=str(data_dir()),
    )


@router.get("", response_model=SettingsOut)
def read(settings: Settings = Depends(app_settings)) -> SettingsOut:
    return _out(settings)


@router.put("", response_model=SettingsOut)
def update(body: SettingsUpdate, request: Request) -> SettingsOut:
    values = body.model_dump(exclude_none=True)
    if values.get("replay_dir") and not Path(values["replay_dir"]).is_dir():
        raise HTTPException(400, "Ce dossier n'existe pas.")
    values = {k: v.strip() for k, v in values.items()}
    write_user_settings(values)
    get_settings.cache_clear()

    old: Settings = request.app.state.settings
    new = old.model_copy(update=values)
    request.app.state.settings = new
    if new.resolved_replay_dir() != old.resolved_replay_dir() or new.resolved_toon_handle() != old.resolved_toon_handle():
        from app.main import start_replay_watching

        start_replay_watching(request.app, getattr(request.app.state, "start_watchers", True))
    return _out(new)
