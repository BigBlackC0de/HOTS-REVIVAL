from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


_engine: Engine | None = None
SessionLocal = sessionmaker(autoflush=False, expire_on_commit=False)


def init_engine(url: str) -> Engine:
    global _engine
    kwargs: dict = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        kwargs = {"connect_args": {"check_same_thread": False, "timeout": 15}}
    _engine = create_engine(url, **kwargs)
    if url.startswith("sqlite:///"):
        # WAL : lectures de l'UI pendant qu'un replay est importé en arrière-plan.
        @event.listens_for(_engine, "connect")
        def _sqlite_pragmas(dbapi_conn, _record):  # type: ignore[no-untyped-def]
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()
    SessionLocal.configure(bind=_engine)
    return _engine


def create_schema() -> None:
    from app import models  # noqa: F401  (enregistre les tables)

    assert _engine is not None, "init_engine() doit être appelé avant create_schema()"
    Base.metadata.create_all(_engine)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
