"""Réanalyse de l'historique quand l'analyseur évolue (ex. nouveaux évènements de carte).

Les résumés IA déjà générés sont archivés en base (app/safekeeping.py) et rattachés
automatiquement à la partie réimportée : aucun appel à Claude n'est repayé.
"""
from __future__ import annotations

import logging
from pathlib import Path

from sqlalchemy import select

from app.config import data_dir
from app.db import SessionLocal
from app.models import Match, Replay, Report
from app.safekeeping import archive_existing

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


def reanalyze_all(importer) -> dict:  # importer: ReplayImporter
    with SessionLocal() as db:
        kept = archive_existing(db)  # en base avant tout effacement : survit à un plantage
        db.commit()
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

    mark_done()
    log.info("Réanalyse terminée : %s parties", imported)
    return {"reanalyzed": imported, "kept_ai_summaries": kept}
