"""Lecture d'un fichier .StormReplay (archive MPQ) avec heroprotocol.

On ne décode que : header, details, initData et tracker events. Les game events
(entrées clavier/souris) ne sont pas nécessaires à l'analyse et ne sont pas lus.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import mpyq

from app.replay.protocol import load_protocol


@dataclass
class RawReplay:
    header: dict[str, Any]
    details: dict[str, Any]
    initdata: dict[str, Any] | None
    tracker_events: list[dict[str, Any]]


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def read_replay(path: Path) -> RawReplay:
    archive = mpyq.MPQArchive(str(path))
    header_bytes = archive.header["user_data_header"]["content"]
    header = load_protocol().decode_replay_header(header_bytes)
    protocol = load_protocol(header["m_version"]["m_baseBuild"])

    details = protocol.decode_replay_details(archive.read_file("replay.details"))
    initdata = None
    init_bytes = archive.read_file("replay.initData")
    if init_bytes:
        try:
            initdata = protocol.decode_replay_initdata(init_bytes)
        except Exception:  # initData n'est pas indispensable
            initdata = None
    tracker_bytes = archive.read_file("replay.tracker.events") or b""
    tracker = list(protocol.decode_replay_tracker_events(tracker_bytes))
    return RawReplay(header=header, details=details, initdata=initdata, tracker_events=tracker)
