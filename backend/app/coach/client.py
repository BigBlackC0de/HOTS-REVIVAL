"""Intégration Claude (SDK officiel Anthropic)."""
from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator

import anthropic
from anthropic.types.beta import BetaMessageParam
from pydantic import BaseModel, Field

from app.coach.prompts import COACH_SYSTEM, SUMMARY_INSTRUCTIONS
from app.coach.roles import role_context
from app.config import Settings

log = logging.getLogger(__name__)

# Repli serveur automatique si un classifieur de sécurité refuse la requête.
FALLBACK_BETA = "server-side-fallback-2026-07-01"


class GameSummary(BaseModel):
    summary: str = Field(description="Résumé général en 2-3 phrases")
    strengths: list[str]
    weaknesses: list[str]
    key_moments: list[str]
    major_mistakes: list[str]
    excellent_actions: list[str]
    improvement_plan: list[str]
    role_advice: list[str] = Field(
        default_factory=list,
        description="2 à 4 conseils propres au rôle et au héros joués (ex. comment mieux soigner avec ce héros)",
    )


class CoachUnavailable(RuntimeError):
    pass


def coach_available(settings: Settings) -> bool:
    return bool(settings.anthropic_api_key)


def _client(settings: Settings) -> anthropic.AsyncAnthropic:
    if not settings.anthropic_api_key:
        raise CoachUnavailable("ANTHROPIC_API_KEY n'est pas configurée.")
    return anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)


def _system(context: str) -> list[dict]:
    # bloc stable mis en cache, puis contexte joueur (variable)
    return [
        {"type": "text", "text": COACH_SYSTEM, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": context},
    ]


async def stream_coach_reply(
    settings: Settings, context: str, messages: list[BetaMessageParam]
) -> AsyncIterator[str]:
    async with _client(settings).beta.messages.stream(
        model=settings.claude_model,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        output_config={"effort": settings.claude_effort},
        betas=[FALLBACK_BETA],
        fallbacks="default",
        system=_system(context),
        messages=messages,
    ) as stream:
        async for text in stream.text_stream:
            yield text
        final = await stream.get_final_message()
    if final.stop_reason == "refusal":
        yield "\n\n_Le coach n'a pas pu répondre à cette demande. Reformulez votre question._"
    elif final.stop_reason == "max_tokens":
        yield "\n\n_(réponse tronquée)_"


async def generate_game_summary(settings: Settings, facts: dict, context: str) -> GameSummary | None:
    response = await _client(settings).beta.messages.parse(
        model=settings.claude_model,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        output_config={"effort": settings.claude_effort},
        betas=[FALLBACK_BETA],
        fallbacks="default",
        system=_system(context),
        messages=[{
            "role": "user",
            "content": f"{SUMMARY_INSTRUCTIONS}\n\n```json\n{json.dumps(facts, ensure_ascii=False)}\n```",
        }],
        output_format=GameSummary,
    )
    if response.stop_reason == "refusal":
        log.warning("Résumé refusé par le modèle")
        return None
    return response.parsed_output


def deterministic_summary(facts: dict) -> GameSummary:
    """Rapport sans IA (clé absente ou indisponibilité de l'API)."""
    return GameSummary(
        summary=facts.get("headline", ""),
        strengths=facts.get("strengths", []),
        weaknesses=facts.get("weaknesses", []),
        key_moments=facts.get("key_moments", [])[:5],
        major_mistakes=[f"Mort à {t}" for t in facts.get("my_death_times", [])[:3]],
        excellent_actions=[],
        improvement_plan=facts.get("improvement_plan", []),
        role_advice=role_context((facts.get("role_context") or {}).get("role"))["habits"][:3],
    )
