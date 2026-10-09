"""Vérifie qu'aucune API d'accès mémoire / injection / automatisation n'est utilisée."""
from pathlib import Path

from app.live.compliance import FORBIDDEN_CODE_TOKENS

ROOT = Path(__file__).resolve().parents[2]
SCANNED = ("backend/app", "apps/desktop/electron", "apps/desktop/src")
EXTENSIONS = {".py", ".ts", ".tsx", ".js", ".mjs", ".cjs"}


def test_no_forbidden_tokens_in_source():
    offenders = []
    for rel in SCANNED:
        base = ROOT / rel
        if not base.exists():
            continue
        for f in base.rglob("*"):
            if f.suffix not in EXTENSIONS or f.name == "compliance.py":
                continue
            text = f.read_text(encoding="utf-8", errors="ignore")
            offenders += [f"{f.relative_to(ROOT)}: {tok}" for tok in FORBIDDEN_CODE_TOKENS if tok in text]
    assert not offenders, offenders


def test_game_events_are_never_decoded():
    parser = (ROOT / "backend/app/replay/parser.py").read_text(encoding="utf-8")
    assert "decode_replay_game_events" not in parser
