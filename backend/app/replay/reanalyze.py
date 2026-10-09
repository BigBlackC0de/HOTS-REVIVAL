"""Réanalyse de l'historique quand l'analyseur évolue (ex. nouveaux évènements de carte).

Les résumés IA déjà générés sont conservés (rattachés par empreinte du replay) pour ne
pas repayer d'appels à Claude.
"""
from __future__ import annotations

import logging
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import data_dir
from app.db import SessionLocal
from app.models import Match, Replay, Report

log = logging.getLogger(__name__)

# À incrémenter quand l'extraction change de manière significative.
ANALYSIS_VERSION = 3  # 3 : nouveaux héros (Xal'atath)


def _marker() -> Path:
    return data_dir() / "analysis_version.txt"


def needs_reanalysis() -> bool:
    try:
        return int(_marker().read_text().strip()) < ANALYSIS_VERSION
    except (OSError, ValueError):
        return True


def mark_done() -> None:
    _marker().write_text(str(ANALYSIS_VERSION))


def _snapshot_summaries(db: Session) -> dict[str, tuple[dict, str | None]]:
    rows = db.execute(
        select(Replay.file_hash, Report.ai_summary, Report.model)
        .join(Match, Match.replay_id == Replay.id)
        .join(Report, Report.match_id == Match.id)
        .where(Report.ai_summary.is_not(None))
    )
    return {h: (summary, model) for h, summary, model in rows}


def reanalyze_all(importer) -> dict:  # importer: ReplayImporter
    with SessionLocal() as db:
        summaries = _snapshot_summaries(db)
        files = [Path(p) for p in db.scalars(select(Replay.file_path))]
        for match in db.scalars(select(Match)):
            db.query(Report).filter(Report.match_id == match.id).delete()
            db.delete(match)
        db.query(Replay).delete()
        db.commit()

    imported = 0
    for path in files:
        if path.is_file() and importer.import_path(path).status == "imported":
            imported += 1
    importer.scan()  # nouveaux replays éventuels

    with SessionLocal() as db:
        for file_hash, (summary, model) in summaries.items():
            report = db.scalar(
                select(Report).join(Match, Match.id == Report.match_id)
                .join(Replay, Replay.id == Match.replay_id).where(Replay.file_hash == file_hash)
            )
            if report:
                report.ai_summary, report.model = summary, model
        db.commit()
    mark_done()
    log.info("Réanalyse terminée : %s parties", imported)
    return {"reanalyzed": imported, "kept_ai_summaries": len(summaries)}
