import os
import tempfile

import pytest

os.environ["HOTS_DATA_DIR"] = tempfile.mkdtemp(prefix="hots-test-")

os.environ.setdefault("HOTS_DATABASE_URL", "sqlite://")
os.environ["HOTS_WATCH_REPLAYS"] = "false"
os.environ["HOTS_WATCH_LIVE"] = "false"
os.environ["HOTS_REPLAY_DIR"] = ""
os.environ["ANTHROPIC_API_KEY"] = ""

from sqlalchemy.pool import StaticPool  # noqa: E402

from app import db as db_module  # noqa: E402


@pytest.fixture()
def db():
    from sqlalchemy import create_engine

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    db_module._engine = engine
    db_module.SessionLocal.configure(bind=engine)
    db_module.create_schema()
    session = db_module.SessionLocal()
    yield session
    session.close()
    db_module.Base.metadata.drop_all(engine)
