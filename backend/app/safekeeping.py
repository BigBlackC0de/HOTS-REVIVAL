"""Données du joueur à ne jamais perdre, même quand l'analyseur ou l'application évoluent.

- Résumés IA (payés en crédits Claude) : archivés par empreinte du replay dans une table
  jamais vidée, puis rattachés automatiquement à la partie à chaque (ré)import.
- Base complète : copie de sauvegarde au démarrage (les 10 dernières sont gardées).
"""
from __future__ import annotations

import logging
import sqlite3
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import data_dir
from app.models import Match, Replay, Report, SavedAnalysis

log = logging.getLogger(__name__)

BACKUPS_KEPT = 10


def archive_summary(db: Session, file_hash: str, summary: dict, model: str | None) -> None:
    saved = db.scalar(select(SavedAnalysis).where(SavedAnalysis.file_hash == file_hash))
    if saved:
        saved.ai_summary, saved.model = summary, model
    else:
        db.add(SavedAnalysis(file_hash=file_hash, ai_summary=summary, model=model))


def archive_existing(db: Session) -> int:
    """Archive les résumés déjà présents dans les rapports (bases antérieures à l'archive)."""
    rows = db.execute(
        select(Replay.file_hash, Report.ai_summary, Report.model)
        .join(Match, Match.replay_id == Replay.id)
        .join(Report, Report.match_id == Match.id)
        .where(Report.ai_summary.is_not(None))
    ).all()
    known = set(db.scalars(select(SavedAnalysis.file_hash)))
    for file_hash, summary, model in rows:
        if file_hash not in known:
            db.add(SavedAnalysis(file_hash=file_hash, ai_summary=summary, model=model))
            known.add(file_hash)
    return len(rows)


def restore_summary(db: Session, report: Report, file_hash: str) -> None:
    saved = db.scalar(select(SavedAnalysis).where(SavedAnalysis.file_hash == file_hash))
    if saved and report.ai_summary is None:
        report.ai_summary, report.model = saved.ai_summary, saved.model


def backup_database(db_url: str) -> Path | None:
    """Copie cohérente de la base SQLite (compatible WAL) dans <données>/backups."""
    if not db_url.startswith("sqlite:///"):
        return None
    src = Path(db_url.removeprefix("sqlite:///"))
    if not src.is_file():
        return None
    folder = data_dir() / "backups"
    folder.mkdir(parents=True, exist_ok=True)
    dest = folder / f"hots-{datetime.now():%Y%m%d-%H%M%S}.db"
    try:
        with sqlite3.connect(src) as source, sqlite3.connect(dest) as target:
            source.backup(target)
    except sqlite3.Error:
        log.warning("Sauvegarde de la base impossible", exc_info=True)
        dest.unlink(missing_ok=True)
        return None
    for old in sorted(folder.glob("hots-*.db"))[:-BACKUPS_KEPT]:
        old.unlink(missing_ok=True)
    return dest
