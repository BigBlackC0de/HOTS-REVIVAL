"""Génère sql/schema.sql (DDL PostgreSQL) à partir des modèles SQLAlchemy."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateIndex, CreateTable

from app import models  # noqa: F401
from app.db import Base

out = ["-- Généré par scripts/export_schema.py – ne pas éditer à la main.\n"]
for table in Base.metadata.sorted_tables:
    out.append(str(CreateTable(table).compile(dialect=postgresql.dialect())).strip() + ";\n")
    for index in sorted(table.indexes, key=lambda i: i.name or ""):
        out.append(str(CreateIndex(index).compile(dialect=postgresql.dialect())).strip() + ";\n")
Path(__file__).resolve().parents[1].joinpath("sql", "schema.sql").write_text("\n".join(out), encoding="utf-8")
print("sql/schema.sql écrit")
