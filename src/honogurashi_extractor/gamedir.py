"""Locate the installed game for the read-only extraction tools.

Every tool takes ``--game-dir``. When it is omitted, the directory comes from
the ``HONOGURASHI_GAME_DIR`` environment variable, then from the Steam
libraries listed in ``libraryfolders.vdf``.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

ENV = "HONOGURASHI_GAME_DIR"
GAME_FOLDER = "Village in the Shade"


def _steam_roots() -> list[Path]:
    roots = []
    if sys.platform == "win32":
        for variable in ("ProgramFiles(x86)", "ProgramFiles"):
            if base := os.environ.get(variable):
                roots.append(Path(base) / "Steam")
    home = Path.home()
    roots += [home / ".steam/steam", home / ".local/share/Steam", home / "Library/Application Support/Steam"]
    return roots


def library_paths(vdf: str) -> list[Path]:
    """Library roots from the text of a Steam ``libraryfolders.vdf``."""
    return [Path(value.replace("\\\\", "\\")) for value in re.findall(r'"path"\s+"([^"]+)"', vdf)]


def steam_game_dir() -> Path | None:
    for root in _steam_roots():
        libraries = [root]
        vdf = root / "steamapps" / "libraryfolders.vdf"
        if vdf.is_file():
            libraries += library_paths(vdf.read_text(encoding="utf-8", errors="replace"))
        for library in libraries:
            candidate = library / "steamapps" / "common" / GAME_FOLDER
            if (candidate / "data.dat").is_file():
                return candidate
    return None


def default_game_dir() -> Path | None:
    value = os.environ.get(ENV)
    return Path(value) if value else steam_game_dir()


def add_game_dir(parser: argparse.ArgumentParser, *flags: str) -> None:
    """Add ``--game-dir`` (or the given flags), required only when no default is found."""
    default = default_game_dir()
    parser.add_argument(
        *(flags or ("--game-dir",)),
        dest="game_dir",
        type=Path,
        default=default,
        required=default is None,
        help=f"game install directory (default: ${ENV} or the Steam library; currently {default or 'not found'})",
    )


def game_dir(description: str | None = None) -> Path:
    """Parse ``--game-dir`` for scripts that take no other options."""
    parser = argparse.ArgumentParser(description=description)
    add_game_dir(parser)
    return parser.parse_args().game_dir
