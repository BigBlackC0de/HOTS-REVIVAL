"""Point d'entrée de l'exécutable embarqué (PyInstaller), lancé automatiquement par Electron."""
from __future__ import annotations

import argparse
import logging
import sys
from logging.handlers import RotatingFileHandler


def _setup_logging() -> None:
    from app.config import data_dir

    log_file = data_dir() / "backend.log"
    # Sans console (exécutable fenêtré), stdout/stderr valent None : on redirige vers le journal.
    if sys.stdout is None or sys.stderr is None:
        stream = open(log_file.with_suffix(".out.log"), "a", encoding="utf-8", buffering=1)  # noqa: SIM115
        sys.stdout = sys.stdout or stream
        sys.stderr = sys.stderr or stream
    handler = RotatingFileHandler(log_file, maxBytes=2_000_000, backupCount=2, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logging.getLogger().addHandler(handler)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    _setup_logging()
    import uvicorn

    from app.main import app

    uvicorn.run(app, host=args.host, port=args.port, log_config=None, access_log=False)


if __name__ == "__main__":
    main()
