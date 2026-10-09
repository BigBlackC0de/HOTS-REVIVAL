from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.talents import with_names


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class HerosScoreOut(ORM):
    placement: int
    macro: int
    teamfight: int
    objectives: int
    survival: int
    draft: int
    overall: int
    algo_version: str
    details: dict


class MatchPlayerOut(ORM):
    @field_validator("talents", mode="after")
    @classmethod
    def _talent_labels(cls, value: list) -> list:
        return with_names(value)

    id: int
    slot: int
    team: int
    is_winner: bool
    is_me: bool
    name: str
    hero_id: str
    hero_name: str
    role: str | None
    kills: int
    deaths: int
    assists: int
    takedowns: int
    hero_damage: int
    siege_damage: int
    healing: int
    damage_taken: int
    xp_contribution: int
    merc_camp_captures: int
    time_spent_dead_s: int
    talents: list
    score: HerosScoreOut | None = None


class MatchEventOut(ORM):
    t_s: float
    kind: str
    team: int | None
    slot: int | None
    payload: dict


class MatchSummaryOut(ORM):
    id: int
    map_id: str
    map_name: str
    game_mode: str | None
    played_at: datetime | None
    duration_s: int
    winner_team: int | None
    me: MatchPlayerOut | None = None


class MatchDetailOut(MatchSummaryOut):
    game_version: str | None
    team_levels: dict
    players: list[MatchPlayerOut]
    events: list[MatchEventOut]


class ReportOut(BaseModel):
    match_id: int
    facts: dict
    ai_summary: dict | None
    model: str | None


class ImportRequest(BaseModel):
    path: str | None = Field(None, description="Fichier .StormReplay ou dossier. Défaut : dossier configuré.")


class ImportResponse(BaseModel):
    imported: int
    duplicates: int
    failed: int
    match_ids: list[int]


class DraftRequest(BaseModel):
    allies: list[str] = Field(default_factory=list, max_length=5)
    enemies: list[str] = Field(default_factory=list, max_length=5)
    bans: list[str] = Field(default_factory=list, max_length=6)
    map_id: str | None = None
    use_personal_stats: bool = True


class DraftResponse(BaseModel):
    strengths: list[str]
    weaknesses: list[str]
    synergies: list[str]
    threats: list[str]
    win_conditions: list[str]
    counters: list[str]
    phases: dict[str, int]
    recommendations: list[dict]
    composition_score: int
    unknown_heroes: list[str]


class CoachChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: int | None = None
    match_id: int | None = None


class LiveStartRequest(BaseModel):
    map_id: str | None = None
    my_hero_id: str | None = None
    clock_s: float = 0.0


class LiveSyncRequest(BaseModel):
    clock_s: float = Field(ge=0, le=3600)
    source: Literal["manuel", "écran"] = "manuel"


class LiveHeroRequest(BaseModel):
    hero_id: str = Field(min_length=1, max_length=48)


class LiveLevelsRequest(BaseModel):
    ally: int | None = Field(None, ge=1, le=30)
    enemy: int | None = Field(None, ge=1, le=30)
    ally_delta: int | None = Field(None, ge=-1, le=1)
    enemy_delta: int | None = Field(None, ge=-1, le=1)
    source: Literal["manuel", "écran"] = "manuel"


class LiveCampRequest(BaseModel):
    camp_type: Literal["siege", "bruiser", "boss", "support", "other"]
    side: Literal["ally", "enemy"] = "ally"
