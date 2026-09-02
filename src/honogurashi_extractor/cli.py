from __future__ import annotations

import argparse
from collections.abc import Sequence
from pathlib import Path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="honogurashi-data")
    subcommands = parser.add_subparsers(dest="command", required=True)

    extract = subcommands.add_parser("extract", help="extract a normalized snapshot")
    extract.add_argument("--game-dir", type=Path, required=True)
    extract.add_argument("--output", type=Path, required=True)

    diff = subcommands.add_parser("diff", help="compare two normalized snapshots")
    diff.add_argument("before", type=Path)
    diff.add_argument("after", type=Path)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    build_parser().parse_args(argv)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
