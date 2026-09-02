from __future__ import annotations

import argparse
import json
from collections.abc import Sequence
from pathlib import Path

from .archive import FafullfsArchive
from .probe import build_probe
from .schema import SchemaError, load_schema_file, verify_schema_evidence
from .table import read_table


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="honogurashi-data")
    subcommands = parser.add_subparsers(dest="command", required=True)

    extract = subcommands.add_parser("extract", help="extract a normalized snapshot")
    extract.add_argument("--game-dir", type=Path, required=True)
    extract.add_argument("--output", type=Path, required=True)

    diff = subcommands.add_parser("diff", help="compare two normalized snapshots")
    diff.add_argument("before", type=Path)
    diff.add_argument("after", type=Path)

    inspect_archive = subcommands.add_parser(
        "inspect-archive", help="list entries in the installed data.dat"
    )
    inspect_archive.add_argument("--game-dir", type=Path, required=True)

    inspect_table = subcommands.add_parser(
        "inspect-table", help="show the shape of one archived database table"
    )
    inspect_table.add_argument("--game-dir", type=Path, required=True)
    inspect_table.add_argument("entry")

    probe = subcommands.add_parser(
        "probe", help="write an evidence report for archived database tables"
    )
    probe.add_argument("--game-dir", type=Path, required=True)
    probe.add_argument("--tables", required=True)
    probe.add_argument("--output", type=Path, required=True)

    verify_schemas = subcommands.add_parser(
        "verify-schemas", help="verify build schemas against installed game data"
    )
    verify_schemas.add_argument("--game-dir", type=Path, required=True)
    verify_schemas.add_argument("--build-id", required=True)
    verify_schemas.add_argument("--schema-dir", type=Path, default=Path("data/schemas"))

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "inspect-archive":
        archive = FafullfsArchive.open(args.game_dir / "data.dat")
        print(f"entries={len(archive.entries())}")
        for entry in archive.entries():
            print(f"{entry.name}\t{entry.size}")
    elif args.command == "inspect-table":
        archive = FafullfsArchive.open(args.game_dir / "data.dat")
        table = read_table(archive.read_entry(args.entry))
        print(
            f"records={table.record_count} record_size={table.record_size} "
            f"strings={len(table.string_pool)}"
        )
    elif args.command == "probe":
        archive = FafullfsArchive.open(args.game_dir / "data.dat")
        names = [name.strip() for name in args.tables.split(",") if name.strip()]
        tables = {
            name: read_table(archive.read_entry(f"data/database/{name}.dat"))
            for name in names
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps(build_probe(tables), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"wrote={args.output} tables={len(tables)}")
    elif args.command == "verify-schemas":
        archive = FafullfsArchive.open(args.game_dir / "data.dat")
        schema_root = args.schema_dir / f"build-{args.build_id}"
        schema_paths = sorted(schema_root.glob("*.json"))
        if not schema_paths:
            raise SchemaError(f"no schemas found in {schema_root}")
        for path in schema_paths:
            schema = load_schema_file(path)
            if schema.build_id != args.build_id:
                raise SchemaError(
                    f"schema {path.name} targets build {schema.build_id}, not {args.build_id}"
                )
            table = read_table(
                archive.read_entry(f"data/database/{schema.table}.dat")
            )
            raw_schema = json.loads(path.read_text(encoding="utf-8"))
            observed = set(raw_schema.get("observed_record_sizes", []))
            actual = {len(record) for record in table.records}
            if observed and actual != observed:
                raise SchemaError(
                    f"record sizes changed for {schema.table}: {sorted(actual)}"
                )
            verify_schema_evidence(schema, table.records)
            print(
                f"ok table={schema.table} records={table.record_count} "
                f"sizes={','.join(map(str, sorted(actual)))}"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
