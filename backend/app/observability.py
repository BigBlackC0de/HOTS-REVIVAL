"""Sentry (erreurs) et PostHog (analytics produit) – opt-in, aucune donnée de jeu brute envoyée."""
from __future__ import annotations

import logging
from typing import Any

from app.config import Settings

log = logging.getLogger(__name__)
_posthog: Any = None


def init_observability(settings: Settings) -> None:
    global _posthog
    if settings.sentry_dsn:
        import sentry_sdk

        sentry_sdk.init(dsn=settings.sentry_dsn, traces_sample_rate=0.1, send_default_pii=False)
        log.info("Sentry activé")
    if settings.posthog_key:
        from posthog import Posthog

        _posthog = Posthog(settings.posthog_key, host=settings.posthog_host)
        log.info("PostHog activé")


def track(event: str, properties: dict[str, Any] | None = None, distinct_id: str = "local-user") -> None:
    if _posthog is not None:
        try:
            _posthog.capture(event, distinct_id=distinct_id, properties=properties or {})
        except Exception:  # l'analytics ne doit jamais casser l'application
            log.debug("PostHog capture failed", exc_info=True)
